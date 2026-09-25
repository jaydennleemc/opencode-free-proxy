// Regression: a retry scheduled AFTER the client response headers were
// committed made the next attempt call res.writeHead() again, throwing
// ERR_HTTP_HEADERS_SENT inside a stream event handler — an uncaught
// exception that killed the proxy process (and with it the container).
process.env.METRICS = "0";
process.env.RETRY_BASE_MS = "50";
process.env.LOG_DETAIL = "0";

import { describe, it } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import https from "node:https";

const { pipeZenResponse } = await import("../src/pipe-openai.mjs");

const SSE_CHUNK =
  'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n';

/** Minimal Express-like response; writeHead throws once headers are out. */
function fakeRes() {
  const ee = new EventEmitter();
  const res = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    closed: false,
    writeHeadCount: 0,
    chunks: [],
    statusCode: 200,
    on: ee.on.bind(ee),
    once: ee.once.bind(ee),
    emit: ee.emit.bind(ee),
    removeListener: ee.removeListener.bind(ee),
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(obj) {
      res.headersSent = true;
      res.writableEnded = true;
      res.jsonBody = obj;
      ee.emit("close");
      return res;
    },
    writeHead(code) {
      if (res.headersSent) {
        const err = new Error(
          "Cannot write headers after they are sent to the client",
        );
        err.code = "ERR_HTTP_HEADERS_SENT";
        throw err;
      }
      res.writeHeadCount++;
      res.headersSent = true;
      res.statusCode = code;
      return res;
    },
    flushHeaders() {},
    write(s) {
      res.chunks.push(String(s));
      return true;
    },
    end() {
      res.writableEnded = true;
      ee.emit("close");
      return res;
    },
    flush() {},
  };
  return res;
}

function runPipe(res, requestImpl, opts = {}) {
  const original = https.request;
  https.request = requestImpl;
  const restore = () => {
    https.request = original;
  };
  try {
    pipeZenResponse(
      { hostname: "example.invalid", headers: {} },
      JSON.stringify({ model: "m", messages: [] }),
      opts.stream ?? true,
      res,
      { retries: 2, user: "u", clientReq: { aborted: false } },
    );
  } catch (e) {
    restore();
    throw e;
  }
  return restore;
}

/** Fake ClientRequest: fires the response callback, then an event later. */
function fakeReq() {
  const req = new EventEmitter();
  req.write = () => true;
  req.end = () => req;
  req.destroy = () => req;
  return req;
}

function fakeZenRes(status = 200) {
  const ee = new EventEmitter();
  const zr = {
    statusCode: status,
    headers: {},
    complete: false,
    on: ee.on.bind(ee),
    once: ee.once.bind(ee),
    emit: ee.emit.bind(ee),
    removeListener: ee.removeListener.bind(ee),
    resume() {},
    destroy() {
      ee.emit("close");
    },
  };
  return zr;
}

function waitFor(fn, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (fn()) return resolve();
      } catch (e) {
        return reject(e);
      }
      if (Date.now() - start > timeoutMs)
        return reject(new Error("waitFor timeout"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("stream retry after headers sent", () => {
  it("openai: mid-stream upstream error must not rewrite headers", async () => {
    const res = fakeRes();
    let calls = 0;
    const restore = runPipe(res, (opts, cb) => {
      calls++;
      const req = fakeReq();
      const zr = fakeZenRes();
      queueMicrotask(() => {
        cb(zr);
        zr.emit("data", Buffer.from(SSE_CHUNK));
        if (calls === 1) {
          // Mid-stream failure after headers are committed: this used to
          // schedule a retry that re-sent writeHead → process crash.
          queueMicrotask(() =>
            req.emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })),
          );
        } else {
          zr.complete = true;
          queueMicrotask(() => zr.emit("end"));
        }
      });
      return req;
    });
    try {
      await waitFor(() => res.writableEnded);
      assert.strictEqual(res.writeHeadCount, 1, "writeHead called once");
      assert.ok(res.chunks.join("").includes('"content":"Hi"'));
      assert.ok(res.chunks.some((c) => c.includes('"error"')), "emits an error event");
      assert.ok(res.chunks.join("").includes("[DONE]"), "closes the SSE stream");
      assert.ok(calls <= 2, `attempts=${calls}`);
    } finally {
      restore();
    }
  });

  it("openai: retry before headers (rate-limit on first chunk) still works", async () => {
    const res = fakeRes();
    let calls = 0;
    const restore = runPipe(res, (opts, cb) => {
      calls++;
      const req = fakeReq();
      const zr = fakeZenRes(calls === 1 ? 429 : 200);
      queueMicrotask(() => {
        cb(zr);
        if (calls === 1) {
          zr.emit(
            "data",
            Buffer.from(JSON.stringify({ error: { message: "Rate limit exceeded", type: "rate_limit_error" } })),
          );
          zr.complete = true;
          zr.emit("end");
        } else {
          zr.emit("data", Buffer.from(SSE_CHUNK + "data: [DONE]\n"));
          zr.complete = true;
          zr.emit("end");
        }
      });
      return req;
    });
    try {
      await waitFor(() => res.writableEnded);
      assert.strictEqual(calls, 2, "retried once");
      assert.strictEqual(res.writeHeadCount, 1);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.chunks.join("").includes("[DONE]"));
    } finally {
      restore();
    }
  });

  it("openai: sync client keeps working after mid-stream failure", async () => {
    const res = fakeRes();
    let calls = 0;
    const restore = runPipe(
      res,
      (opts, cb) => {
        calls++;
        const req = fakeReq();
        const zr = fakeZenRes();
        queueMicrotask(() => {
          cb(zr);
          if (calls === 1) {
            zr.emit("data", Buffer.from(SSE_CHUNK));
            queueMicrotask(() =>
              req.emit("error", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })),
            );
          } else {
            zr.emit(
              "data",
              Buffer.from(
                'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n' +
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\ndata: [DONE]\n',
              ),
            );
            zr.complete = true;
            zr.emit("end");
          }
        });
        return req;
      },
      { stream: false },
    );
    try {
      await waitFor(() => res.writableEnded);
      assert.strictEqual(res.writeHeadCount, 0, "sync mode holds headers");
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonBody?.choices?.[0]?.message?.content, "Hi");
    } finally {
      restore();
    }
  });
});
