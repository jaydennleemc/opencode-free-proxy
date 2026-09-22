# Metrics Dashboard — Design

Date: 2026-09-22
Status: approved
Branch: `dashboard`

## Goal

A web dashboard showing token-usage metrics for the proxy: tokens, requests,
and errors, broken down by model and API key, over selectable time ranges.

## Architecture

```
Browser ──poll 5s──▶ dashboard/  Next.js 16 Route Handler (/api/metrics)
                          │  server-side env: PROXY_URL + PROXY_API_KEY
                          ▼
              proxy  GET /v1/metrics?range=…  (existing Bearer auth)
                          │
                          ▼
              metrics.db (SQLite via node:sqlite, written by the pipes)
```

The proxy records each completed request. The dashboard never holds the API
key in the browser and never touches the database directly.

## Proxy changes

### `src/metrics.mjs` (new)

- Uses Node's built-in `node:sqlite` (`DatabaseSync`) — zero new dependencies.
- Env: `METRICS=0` disables (all functions no-op), `METRICS_FILE` sets the DB
  path (default `./metrics.db`). File is gitignored.
- Schema:

```sql
CREATE TABLE IF NOT EXISTS requests (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,   -- ms epoch
  endpoint      TEXT NOT NULL,      -- chat | responses | messages
  model         TEXT NOT NULL,
  key_label     TEXT NOT NULL,      -- api-keys.json entry name
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated     INTEGER NOT NULL DEFAULT 0,  -- 1 when tokens are chars/4 estimates
  status        TEXT NOT NULL,      -- ok | error | rate_limited
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  error         TEXT                -- short message/type when status != ok
);
CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
```

- `recordRequest(entry)` — fire-and-forget, wrapped in try/catch; a metrics
  failure must never break proxying.
- `queryMetrics(range)` — aggregate read for the route.

### Recording hooks

The three pipes (`pipe-openai`, `pipe-response`, `pipe-anthropic`) call
`recordRequest` at every terminal path: success, rate-limit exhausted,
upstream error, network error, timeout, empty response.

- Token counts: capture Zen's `usage` field from SSE chunks when present
  (`transformSseLine` in pipe-openai gains an optional usage slot;
  `aggregateSseToCompletion` surfaces `usage` in its result). When absent,
  fall back to the existing chars/4 estimates (`estimated = 1`).
- `inputTokens` estimates already exist in the messages/responses routes; the
  chat route computes the same `(JSON.stringify(messages).length / 4) | 0`
  estimate and passes it via `ctx.metrics`.
- Retries do not multiply-count: only the final outcome of a client request
  is recorded (terminal paths only, never retry scheduling).

### `src/routes/metrics.mjs` (new)

`GET /v1/metrics?range=1h|24h|7d|30d` (default `24h`) behind the existing
`auth()` check. Response:

```json
{
  "range": "24h",
  "since": 1758500000000,
  "bucketMs": 3600000,
  "totals":  { "requests": 0, "errors": 0, "inputTokens": 0, "outputTokens": 0, "avgLatencyMs": 0 },
  "series":  [{ "t": 0, "requests": 0, "errors": 0, "inputTokens": 0, "outputTokens": 0 }],
  "byModel": [{ "model": "", "requests": 0, "errors": 0, "inputTokens": 0, "outputTokens": 0 }],
  "byKey":   [{ "keyLabel": "", "requests": 0, "errors": 0, "inputTokens": 0, "outputTokens": 0 }],
  "recentErrors": [{ "ts": 0, "endpoint": "", "model": "", "error": "", "latencyMs": 0 }]
}
```

Buckets: `1h` → per minute, `24h` → per hour, `7d` → per hour, `30d` → per day.
Series is zero-filled so charts have no gaps.

### Docker / config

- `docker-compose.yaml`: named volume mounted at the `METRICS_FILE` directory
  (root filesystem stays read-only).
- `.gitignore`: `metrics.db*`.
- `Agents.md`: document the new env vars, file, and endpoint.

## Dashboard (`dashboard/`)

- Scaffold: `create-next-app` — **Next.js 16, App Router, Turbopack, Tailwind
  CSS v4, TypeScript** (the dashboard is an independent app with its own
  package.json; the repo's no-TypeScript rule applies to the proxy).
- `app/api/metrics/route.ts` — BFF forwarder: reads `PROXY_URL` and
  `PROXY_API_KEY` from server env, calls `GET /v1/metrics?range=…`, returns
  the JSON with `cache: "no-store"`. Missing env → 500 with a clear message;
  proxy 401 → 502 "check PROXY_API_KEY".
- `app/page.tsx` — single dashboard page (client component):
  - Range selector: 1h / 24h / 7d / 30d
  - Stat cards: total tokens, requests, error rate, avg latency
  - Tokens-over-time area chart (input vs output)
  - Per-model bar chart, per-key table, recent-errors list
  - Polling via SWR (`refreshInterval: 5000`), last-updated timestamp
  - Dark theme, dense monitoring layout, responsive (mobile + desktop)
  - States: loading, empty (no data yet), proxy unreachable (keeps last good
  data + warning banner)
- Deps beyond Next/Tailwind: `swr`, `recharts`.
- `.env.local` (gitignored) holds `PROXY_URL` / `PROXY_API_KEY`; an
  `.env.example` documents them.

## Error handling

- Proxy: recording is best-effort; the read route returns empty aggregates
  (not an error) when the DB has no rows.
- Dashboard: failed polls keep last good data and show a banner; 401 from the
  proxy surfaces as a configuration error.

## Testing & verification

- Proxy: `tests/metrics.test.mjs` (recorder + aggregation with a temp DB,
  disabled-mode no-op, zero-fill) and route tests (401 unauthenticated, 200
  with valid key, range validation). `npm test` stays green.
- Dashboard: `npm run build` passes; browser verification of the range
  selector, numbers cross-checked against SQLite, error banner with proxy
  stopped, desktop + mobile viewports.
