import { describe, it, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";

const tmpKeys = path.join(os.tmpdir(), `opencode-response-keys-${Date.now()}.json`);
process.env.KEYS_FILE = tmpKeys;

const { createApp } = await import("../src/app.mjs");
const { MODELS } = await import("../src/config/index.mjs");
const { loadKeys, apiKeys } = await import("../src/auth.mjs");

loadKeys();

after(() => {
  try { fs.unlinkSync(tmpKeys); } catch {}
});

async function withServer(fn) {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

describe("POST /v1/responses", () => {
  it("returns 401 without a key", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELS[0], input: "hi" }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.type, "error");
    });
  });

  it("returns 400 when body is missing", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKeys.admin },
      });
      assert.strictEqual(res.status, 400);
    });
  });

  it("returns 400 when model is missing", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKeys.admin },
        body: JSON.stringify({ input: "hi" }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.match(body.error?.message || "", /model/i);
    });
  });

  it("does not 400 on a custom model id", async () => {
    await withServer(async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKeys.admin,
          },
          body: JSON.stringify({
            model: "my-custom-model",
            input: "hi",
          }),
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.json().catch(() => ({}));
        assert.doesNotMatch(
          body.error?.message || "",
          /Unknown model/,
          `proxy must not reject custom model ids: ${JSON.stringify(body)}`,
        );
      } catch (e) {
        if (e.name !== "TimeoutError" && e.name !== "AbortError") throw e;
      }
    });
  });

  it("accepts x-api-key header for auth", async () => {
    await withServer(async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKeys.admin,
          },
          body: JSON.stringify({ model: MODELS[0], input: "hi" }),
          signal: AbortSignal.timeout(8000),
        });
        // Should get past auth (401) — upstream may fail but that's OK
        assert.notStrictEqual(res.status, 401);
      } catch (e) {
        if (e.name !== "TimeoutError" && e.name !== "AbortError") throw e;
      }
    });
  });

  it("accepts Authorization: Bearer header for auth", async () => {
    await withServer(async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKeys.admin}`,
          },
          body: JSON.stringify({ model: MODELS[0], input: "hi" }),
          signal: AbortSignal.timeout(8000),
        });
        assert.notStrictEqual(res.status, 401);
      } catch (e) {
        if (e.name !== "TimeoutError" && e.name !== "AbortError") throw e;
      }
    });
  });
});
