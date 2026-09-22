import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Point the metrics DB at a temp file before importing the module
// (npm test sets METRICS=0; these tests need it on).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-test-"));
const dbFile = path.join(tmpDir, "metrics.db");
process.env.METRICS = "1";
process.env.METRICS_FILE = dbFile;

const {
  recordRequest,
  queryMetrics,
  RANGES,
  _resetForTests,
} = await import("../src/metrics.mjs");

before(() => _resetForTests());
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function entry(over = {}) {
  return {
    endpoint: "chat",
    model: "big-pickle",
    keyLabel: "admin",
    inputTokens: 100,
    outputTokens: 50,
    estimated: false,
    status: "ok",
    latencyMs: 800,
    error: null,
    ts: Date.now(),
    ...over,
  };
}

test("recordRequest writes a row readable via queryMetrics", () => {
  recordRequest(entry());
  const m = queryMetrics("1h");
  assert.equal(m.totals.requests, 1);
  assert.equal(m.totals.errors, 0);
  assert.equal(m.totals.inputTokens, 100);
  assert.equal(m.totals.outputTokens, 50);
  assert.equal(m.totals.avgLatencyMs, 800);
});

test("queryMetrics aggregates errors, models, keys, and series buckets", () => {
  const now = Date.now();
  recordRequest(entry({ ts: now, status: "rate_limited", error: "Rate limit exceeded", inputTokens: 0, outputTokens: 0 }));
  recordRequest(entry({ ts: now, model: "grok-code", keyLabel: "user-default", inputTokens: 200, outputTokens: 80 }));

  const m = queryMetrics("1h");
  assert.equal(m.totals.requests, 3);
  assert.equal(m.totals.errors, 1);
  assert.equal(m.totals.inputTokens, 300);
  assert.equal(m.totals.outputTokens, 130);

  const models = Object.fromEntries(m.byModel.map((r) => [r.model, r]));
  assert.equal(models["big-pickle"].requests, 2);
  assert.equal(models["grok-code"].outputTokens, 80);

  const keys = Object.fromEntries(m.byKey.map((r) => [r.keyLabel, r]));
  assert.equal(keys["admin"].requests, 2);
  assert.equal(keys["user-default"].requests, 1);

  // 1h range = one-minute buckets spanning the window, zero-filled
  assert.equal(m.series.length, 61);
  assert.equal(m.bucketMs, 60_000);
  assert.equal(m.series.reduce((n, b) => n + b.requests, 0), 3);

  assert.equal(m.recentErrors.length, 1);
  assert.equal(m.recentErrors[0].error, "Rate limit exceeded");
  assert.equal(m.recentErrors[0].endpoint, "chat");

  // recent = all statuses, newest first
  assert.equal(m.recent.length, 3);
  assert.equal(m.recent[0].keyLabel, "user-default");
  assert.equal(m.recent[1].status, "rate_limited");
  assert.equal(m.recent[2].inputTokens, 100);
});

test("queryMetrics excludes rows outside the range window", () => {
  const old = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
  recordRequest(entry({ ts: old, inputTokens: 999 }));

  const m1h = queryMetrics("1h");
  assert.equal(m1h.totals.requests, 3); // unchanged

  const m24h = queryMetrics("24h");
  assert.equal(m24h.totals.requests, 4);
  assert.equal(m24h.bucketMs, 3_600_000);
  assert.equal(m24h.series.length, 25);
});

test("all ranges are supported", () => {
  assert.deepEqual(Object.keys(RANGES).sort(), ["1h", "24h", "30d", "7d"]);
  for (const r of Object.keys(RANGES)) {
    const m = queryMetrics(r);
    assert.ok(m.series.length > 0, r);
  }
});

test("queryMetrics rejects unknown ranges", () => {
  assert.throws(() => queryMetrics("5m"));
});

test("invalid entries are rejected without throwing", () => {
  assert.doesNotThrow(() => recordRequest({}));
  assert.doesNotThrow(() => recordRequest(null));
  const m = queryMetrics("1h");
  assert.equal(m.totals.requests, 3); // unchanged
});
