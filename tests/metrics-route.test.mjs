import { describe, it, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-route-test-"));
process.env.KEYS_FILE = path.join(tmpDir, "api-keys.json");
// npm test sets METRICS=0; these tests need it on
process.env.METRICS = "1";
process.env.METRICS_FILE = path.join(tmpDir, "metrics.db");

const { createApp } = await import("../src/app.mjs");
const { loadKeys, apiKeys } = await import("../src/auth.mjs");
const { recordRequest, _resetForTests } = await import("../src/metrics.mjs");

loadKeys();
_resetForTests();
const KEY = apiKeys["user-default"] || Object.values(apiKeys)[0];

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

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

function getMetrics(port, query = "", key = KEY) {
  return fetch(`http://127.0.0.1:${port}/v1/metrics${query}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
}

describe("GET /v1/metrics", () => {
  it("returns 401 without a key", async () => {
    await withServer(async (port) => {
      const res = await getMetrics(port, "", "wrong-key");
      assert.strictEqual(res.status, 401);
    });
  });

  it("accepts x-api-key auth as well", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/metrics`, {
        headers: { "x-api-key": KEY },
      });
      assert.strictEqual(res.status, 200);
    });
  });

  it("returns 400 for an unknown range", async () => {
    await withServer(async (port) => {
      const res = await getMetrics(port, "?range=5m");
      assert.strictEqual(res.status, 400);
    });
  });

  it("returns recorded aggregates for a valid range", async () => {
    recordRequest({
      endpoint: "chat",
      model: "big-pickle",
      keyLabel: "user-default",
      inputTokens: 120,
      outputTokens: 45,
      status: "ok",
      latencyMs: 500,
    });
    recordRequest({
      endpoint: "messages",
      model: "grok-code",
      keyLabel: "admin",
      inputTokens: 0,
      outputTokens: 0,
      status: "rate_limited",
      latencyMs: 1200,
      error: "Rate limit exceeded",
    });

    await withServer(async (port) => {
      const res = await getMetrics(port, "?range=1h");
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.range, "1h");
      assert.ok(body.totals.requests >= 2);
      assert.ok(body.totals.errors >= 1);
      assert.ok(body.totals.inputTokens >= 120);
      assert.ok(body.byModel.length >= 2);
      assert.ok(body.byKey.length >= 2);
      assert.ok(body.series.length > 0);
      assert.ok(body.recentErrors.length >= 1);
      assert.strictEqual(body.recentErrors[0].error, "Rate limit exceeded");
    });
  });

  it("defaults to 24h", async () => {
    await withServer(async (port) => {
      const res = await getMetrics(port);
      const body = await res.json();
      assert.strictEqual(body.range, "24h");
    });
  });
});
