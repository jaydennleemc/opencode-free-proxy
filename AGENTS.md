# opencode-free-proxy

Modular Node.js Express proxy that translates OpenAI/Anthropic API calls onto a local `opencode serve` instance (the only path the free tier still accepts).

## Quick start

```bash
npm install   # also pulls the opencode binary (opencode-ai npm dep)
npm start     # port 6446
```

API keys are auto-generated into `api-keys.json` on first run — no `.env` setup needed.

## Key facts

- **ESM only** — `"type": "module"` in package.json; use `import` not `require`.
- **No build step** — raw Node.js, no TypeScript, no bundler.
- **Tests** — `npm test` runs Node built-in test runner in `tests/`.
- **Architecture (v0.2+)** — the proxy spawns `opencode serve` (from the `opencode-ai` npm dep, or `OPENCODE_BIN` override) and relays through its session API. Direct `opencode.ai/zen/v1` spoofing died on 2026-09-16 when the free-tier check moved into their closed inference layer.
- **`OPENCODE_AGENT` must be a native agent** (default `build`) — the free-tier gate rejects custom agents. Do not add a custom agent config to solve behavior issues; it will 403.
- **Two API formats** served on the same server:
  - `POST /v1/chat/completions` (OpenAI)
  - `POST /v1/messages` (Anthropic)
  - Auth works with either `Authorization: Bearer KEY` or `x-api-key: KEY` header.
- **Session pool** — per-API-key pool of real opencode sessions (`SESSION_POOL_SIZE`, default 4). One session = one in-flight prompt. Prior history is replayed via `noReply` prompts before the real one (context caching); 429 rotates the session and retries with backoff (`MAX_RETRIES` × `rateLimitRetryDelay`).
- **Streaming is simulated** — opencode's sync prompt endpoint returns the full reply; we emit it as OpenAI/Anthropic SSE chunks (400-char slices). Clients see proper SSE, but nothing arrives until the model finishes.
- **No real tool calling** — client-side tool loops can't run inside an opencode session. `tools` in requests are ignored; history tool messages are flattened to `[tool call]`/`[tool result]` text.
- **Dependencies** — `express` + `opencode-ai` (binary only; we never import its JS).

## Env vars

| Variable | Default | Notes |
|----------|---------|-------|
| `PROXY_PORT` | `6446` | Proxy listen port |
| `OPENCODE_PORT` | `4096` | Spawned `opencode serve` port |
| `OPENCODE_AGENT` | `build` | Must stay a native agent (see above) |
| `OPENCODE_BIN` | — | Override opencode binary path |
| `OC_TIMEOUT_MS` | `120000` | Max wait for one prompt |
| `SESSION_POOL_SIZE` | `4` | Sessions (concurrent requests) per user |
| `KEYS_FILE` | `./api-keys.json` | Auto-created if missing |
| `MAX_RETRIES` | `12` | Rate-limit / transient retries |
| `RETRY_BASE_MS` / `RETRY_MAX_MS` | `1000` / `30000` | Backoff base / cap (±20% jitter) |
| `LOG_DETAIL` | `1` | `0` disables full I/O dumps |
| `LOG_MAX_CHARS` | `0` | Truncate logged payloads (0 = unlimited) |
| `NO_COLOR` / `FORCE_COLOR` | — | ANSI color control |

## Files

| Path | Purpose |
|------|---------|
| `src/index.mjs` | Entry: spawn opencode, load keys, start server |
| `src/opencode.mjs` | opencode binary resolution + spawn + readiness |
| `src/oc-client.mjs` | HTTP client for `opencode serve` session API |
| `src/session-pool.mjs` | Per-user pool of real opencode sessions |
| `src/pipeline.mjs` | Prompt orchestration: history cache + retry/rotate |
| `src/convert.mjs` | OpenAI messages → opencode prompt terms |
| `src/translate.mjs` | opencode reply → OpenAI/Anthropic (sync + SSE) |
| `src/to-openai.mjs` | Anthropic → OpenAI message converter |
| `src/retry.mjs` | Backoff helper |
| `src/routes/*.mjs` | Route handlers |
| `models.json` | Available models (free tier) |
| `api-keys.json` | Auto-generated, **never commit** |
| `Dockerfile` | Multi-stage, bundles opencode binary, non-root |
| `docker-compose.yaml` | Production: read-only rootfs, cap_drop ALL |

## Style

- No TypeScript, no lint config — just raw JS with Express.
- `console.log` for logging (no structured logger).
- The main complexity is the opencode session relay in `pipeline.mjs` and the format translation in `translate.mjs`/`convert.mjs` — preserve behavior when touching.
- The free-tier gate is a black box maintained by OpenCode; if it changes, check whether the request still looks like a native-agent, real-session prompt before blaming our code.
