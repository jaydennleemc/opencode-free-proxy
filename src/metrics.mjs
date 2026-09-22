// Request metrics recorded to a local SQLite file via node:sqlite.
// METRICS=0 disables recording (all functions become no-ops).
// METRICS_FILE sets the DB path (default ./metrics.db).
// Recording is best-effort: failures are logged, never thrown.

import { DatabaseSync } from "node:sqlite";
import { logLine } from "./logger.mjs";

export const METRICS_ENABLED = process.env.METRICS !== "0";
export const METRICS_FILE = process.env.METRICS_FILE || "./metrics.db";

/** range → { windowMs, bucketMs } */
export const RANGES = {
  "1h": { windowMs: 3_600_000, bucketMs: 60_000 },
  "24h": { windowMs: 86_400_000, bucketMs: 3_600_000 },
  "7d": { windowMs: 604_800_000, bucketMs: 3_600_000 },
  "30d": { windowMs: 2_592_000_000, bucketMs: 86_400_000 },
};

let db = null;

function getDb() {
  if (!METRICS_ENABLED) return null;
  if (db) return db;
  db = new DatabaseSync(METRICS_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id            INTEGER PRIMARY KEY,
      ts            INTEGER NOT NULL,
      endpoint      TEXT NOT NULL,
      model         TEXT NOT NULL,
      key_label     TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated     INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL,
      latency_ms    INTEGER NOT NULL DEFAULT 0,
      error         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
  `);
  return db;
}

/** Test hook: reopen the DB on next use (after METRICS_FILE changes). */
export function _resetForTests() {
  try { db?.close(); } catch {}
  db = null;
}

/**
 * Record the final outcome of one client request. Called once per request,
 * at terminal paths only (never per retry). Never throws.
 */
export function recordRequest(entry) {
  if (!METRICS_ENABLED) return;
  try {
    if (!entry || typeof entry !== "object") return;
    const {
      endpoint, model, keyLabel,
      inputTokens = 0, outputTokens = 0, estimated = false,
      status, latencyMs = 0, error = null, ts = Date.now(),
    } = entry;
    if (!endpoint || !model || !keyLabel || !status) return;
    getDb()
      .prepare(
        `INSERT INTO requests
         (ts, endpoint, model, key_label, input_tokens, output_tokens, estimated, status, latency_ms, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Math.floor(ts), endpoint, model, keyLabel,
        Math.floor(inputTokens), Math.floor(outputTokens), estimated ? 1 : 0,
        status, Math.floor(latencyMs),
        error == null ? null : String(error).slice(0, 300),
      );
  } catch (e) {
    logLine("METRICS", "record failed:", e.message);
  }
}

const NUM = (v) => Number(v ?? 0);

/**
 * Aggregate metrics for a range ("1h" | "24h" | "7d" | "30d").
 * Series buckets are zero-filled so charts have no gaps.
 */
export function queryMetrics(range) {
  const cfg = RANGES[range];
  if (!cfg) throw new Error(`unknown range: ${range}`);
  const { windowMs, bucketMs } = cfg;
  const now = Date.now();
  const since = now - windowMs;

  const empty = {
    range, since, bucketMs,
    totals: { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: 0 },
    series: zeroSeries(since, now, bucketMs),
    byModel: [], byKey: [], recentErrors: [],
  };

  if (!METRICS_ENABLED) return empty;
  let d;
  try {
    d = getDb();
  } catch (e) {
    logLine("METRICS", "query failed:", e.message);
    return empty;
  }

  const t = d
    .prepare(
      `SELECT COUNT(*) AS requests,
              SUM(status != 'ok') AS errors,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              AVG(latency_ms) AS avg_latency
       FROM requests WHERE ts >= ?`,
    )
    .get(since);

  const buckets = d
    .prepare(
      `SELECT CAST(ts / ? AS INTEGER) * ? AS bucket,
              COUNT(*) AS requests,
              SUM(status != 'ok') AS errors,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens
       FROM requests WHERE ts >= ?
       GROUP BY bucket ORDER BY bucket`,
    )
    .all(bucketMs, bucketMs, since);

  const byModel = d
    .prepare(
      `SELECT model, COUNT(*) AS requests,
              SUM(status != 'ok') AS errors,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens
       FROM requests WHERE ts >= ?
       GROUP BY model ORDER BY requests DESC`,
    )
    .all(since);

  const byKey = d
    .prepare(
      `SELECT key_label, COUNT(*) AS requests,
              SUM(status != 'ok') AS errors,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens
       FROM requests WHERE ts >= ?
       GROUP BY key_label ORDER BY requests DESC`,
    )
    .all(since);

  const recentErrors = d
    .prepare(
      `SELECT ts, endpoint, model, error, latency_ms
       FROM requests WHERE ts >= ? AND status != 'ok'
       ORDER BY ts DESC LIMIT 20`,
    )
    .all(since);

  const series = zeroSeries(since, now, bucketMs);
  const byBucket = new Map(buckets.map((b) => [NUM(b.bucket), b]));
  for (const point of series) {
    const b = byBucket.get(point.t);
    if (b) {
      point.requests = NUM(b.requests);
      point.errors = NUM(b.errors);
      point.inputTokens = NUM(b.input_tokens);
      point.outputTokens = NUM(b.output_tokens);
    }
  }

  return {
    range,
    since,
    bucketMs,
    totals: {
      requests: NUM(t.requests),
      errors: NUM(t.errors),
      inputTokens: NUM(t.input_tokens),
      outputTokens: NUM(t.output_tokens),
      avgLatencyMs: Math.round(NUM(t.avg_latency)),
    },
    series,
    byModel: byModel.map((r) => ({
      model: r.model,
      requests: NUM(r.requests),
      errors: NUM(r.errors),
      inputTokens: NUM(r.input_tokens),
      outputTokens: NUM(r.output_tokens),
    })),
    byKey: byKey.map((r) => ({
      keyLabel: r.key_label,
      requests: NUM(r.requests),
      errors: NUM(r.errors),
      inputTokens: NUM(r.input_tokens),
      outputTokens: NUM(r.output_tokens),
    })),
    recentErrors: recentErrors.map((r) => ({
      ts: NUM(r.ts),
      endpoint: r.endpoint,
      model: r.model,
      error: r.error,
      latencyMs: NUM(r.latency_ms),
    })),
  };
}

function zeroSeries(since, now, bucketMs) {
  const first = Math.floor(since / bucketMs) * bucketMs;
  const last = Math.floor(now / bucketMs) * bucketMs;
  const out = [];
  for (let t = first; t <= last; t += bucketMs) {
    out.push({ t, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0 });
  }
  return out;
}
