# opencode-free-proxy

Modular Node.js Express proxy that translates OpenAI/Anthropic/Response API calls onto `opencode.ai/zen/v1` with the official-client fingerprint the free tier requires.

## Quick start

```bash
npm install
npm start     # port 6446
```

API keys are auto-generated into `api-keys.json` on first run — no `.env` setup needed.

## Key facts

- **Must run under Bun** — the 2026-10 free-tier gate fingerprints the client's TLS stack; node `https`/`http2` both get `429 FreeUsageLimitError` with identical bodies/headers, only Bun's `fetch` passes (`bun src/index.mjs`). Tests still run under node (`npm test`) — the transport has a seam (`setRequest`) so tests can fake it.
- **ESM only** — `"type": "module"` in package.json; use `import` not `require`.
- **Tests** — `npm test` runs Node built-in test runner in `tests/`.
- **Architecture (v0.3)** — direct `opencode.ai/inference/openai/v1/chat/completions` (the old `/zen/v1` path is dead — it now 401s every anonymous request). The gate fingerprints the client, verified live against the official 2.1.4 client: bun fetch TLS + `User-Agent: opencode/latest/2.1.4/cli` + `Authorization: Bearer public` + `x-opencode-client: cli` + the 40-hex `x-opencode-project` + four equal session headers (`x-opencode-session`/`-id`, `x-session-affinity`, `x-session-id`, `ses_` + 12 hex + 14 base62) + **the official agent system prompt as the first message** (`fingerprint/official-system.txt`, content is the axis: truncated prefixes or same-size padding still 429). The client's own system prompt is appended onto its tail. Tools don't matter for the gate — `{bash, glob, grep, read}` decoys are still added for legacy shape.
- **models.json** = every free model from models.dev's `opencode` entry; other clients (`*` non-free) are paid.
- **Cursor** — custom models forward their tools; the four fingerprint names are injected as decoys if missing.
- **Three API formats** served on the same server:
  - `POST /v1/chat/completions` (OpenAI)
  - `POST /v1/responses` (OpenAI Response API)
  - `POST /v1/messages` (Anthropic)
  - Auth works with either `Authorization: Bearer KEY` or `x-api-key: KEY` header.
- **Metrics** — `GET /v1/metrics?range=1h|24h|7d|30d` (same auth) via `node:sqlite` (bun test can't resolve it, so `src/metrics.mjs` falls back to `bun:sqlite`).
- **Key management** (admin only — the key named `admin`): `GET /v1/keys`, `POST /v1/keys { "name": "…" }`, `DELETE /v1/keys/:name`.
- **Response API** — `previous_response_id` not supported (upstream has no state).
- **Streaming is real** — upstream SSE piped through; sync clients get SSE folded into one JSON body.
- **Dependencies** — `express` only.

## Env vars

| Variable | Default | Notes |
|----------|---------|-------|
| `PROXY_PORT` | `6446` | Proxy listen port |
| `KEYS_FILE` | `./api-keys.json` | Auto-created if missing |
| `MAX_RETRIES` | `12` | Rate-limit / transient retries |
| `RETRY_BASE_MS` / `RETRY_MAX_MS` | `1000` / `30000` | Backoff base / cap (±20% jitter) |
| `LOG_DETAIL` | `1` | `0` disables full I/O dumps |
| `LOG_MAX_CHARS` | `0` | Truncate logged payloads (0 = unlimited) |
| `METRICS` | `1` | `0` disables request metrics recording |
| `METRICS_FILE` | `./metrics.db` | SQLite metrics DB path (gitignored) |
| `NO_COLOR` / `FORCE_COLOR` | — | ANSI color control |

## Files

| Path | Purpose |
|------|---------|
| `src/index.mjs` | Entry: load keys, start server |
| `src/client.mjs` | Inference request builder + fingerprint (UA/session headers/agent-system wrap) |
| `src/zenttp.mjs` | Fetch-based transport (bun fetch; keeps `https.request` callback shape), test seam |
| `src/session.mjs` | Per-user `ses_` id, rotated on 429 |
| `src/pipe-openai.mjs` | Zen SSE → OpenAI SSE / sync JSON |
| `src/pipe-response.mjs` | Zen SSE → Response API SSE / sync JSON |
| `src/pipe-anthropic.mjs` | Zen SSE → Anthropic SSE |
| `src/to-openai.mjs` | Anthropic → OpenAI message converter |
| `src/to-anthropic.mjs` | OpenAI → Anthropic converter |
| `src/to-response.mjs` | Response API ↔ OpenAI converter + streaming state |
| `src/retry.mjs` | Backoff + 429 session rotation |
| `src/metrics.mjs` | SQLite request-metrics recorder + aggregation |
| `src/routes/metrics.mjs` | `GET /v1/metrics` — aggregated metrics |
| `src/routes/keys.mjs` | `GET/POST/DELETE /v1/keys` — admin-only key management |
| `src/routes/*.mjs` | Route handlers |
| `dashboard/` | Next.js 16 + Tailwind v4 metrics dashboard (own package.json) |
| `models.json` | Available models (free tier) |
| `api-keys.json` | Auto-generated, **never commit** |
| `Dockerfile` | All-in-one: proxy + dashboard in one container (`scripts/start.mjs` launcher), multi-stage, non-root |
| `docker-compose.yaml` | Single service, read-only rootfs, cap_drop ALL |

## Style

- No TypeScript, no lint config — just raw JS with Express.
- `console.log` for logging (no structured logger).
- The main complexity is the Zen pipe in `pipe-openai.mjs` / `pipe-anthropic.mjs` / `pipe-response.mjs` and the free-tier fingerprint in `src/client.mjs` — preserve behavior when touching.
- If the free gate rejects again (429 `FreeUsageLimitError`), re-capture a live official-client request (local listener + `baseURL` override) and bisect: transport/TLS first (bun fetch vs node), then UA/headers, then the system-prompt content. `403` from an anonymous call means the gate moved behind login — do not assume it is still fingerprintable.
