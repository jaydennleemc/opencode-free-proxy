# opencode-free-proxy

Modular Node.js Express proxy that translates OpenAI/Anthropic API calls to the Zen API at `opencode.ai`.

## Quick start

```bash
npm install
npm start                          # port 6446
# or with file watching:
npm run dev
```

API keys are auto-generated into `api-keys.json` on first run — no `.env` setup needed.

## Key facts

- **ESM only** — `"type": "module"` in package.json; use `import` not `require`.
- **No build step** — raw Node.js, no TypeScript, no bundler.
- **Tests** — `npm test` runs Node built-in test runner in `tests/`.
- **Two API formats** served on the same server:
  - `POST /v1/chat/completions` (OpenAI)
  - `POST /v1/messages` (Anthropic)
  - Auth works with either `Authorization: Bearer KEY` or `x-api-key: KEY` header.
- **Session rotation** — per-user sessions TTL 30 minutes; **force-rotated on rate-limit** before each 429 retry.
- **Retries** — up to `MAX_RETRIES` on 429 / FreeUsageLimit + transient (network, timeout, 502/503/504); stops if client disconnects; honors `Retry-After` when present.
- **Only dependency** — `express` (listed in package.json, no lockfile committed).

## Env vars

| Variable | Default | Notes |
|----------|---------|-------|
| `PROXY_PORT` | `6446` | Server listen port |
| `KEYS_FILE` | `./api-keys.json` | Auto-created if missing |
| `MAX_RETRIES` | `12` | Rate-limit / transient retries after first attempt |
| `RETRY_BASE_MS` | `1000` | First retry delay; doubles each attempt (±20% jitter) |
| `RETRY_MAX_MS` | `30000` | Cap for exponential backoff / Retry-After |
| `LOG_DETAIL` | `1` | `0` disables full I/O dumps |
| `LOG_MAX_CHARS` | `0` | Truncate logged payloads (0 = unlimited) |
| `NO_COLOR` | — | Set to `1` to disable ANSI color |
| `FORCE_COLOR` | — | Set to `1` to force ANSI color (e.g. `docker compose logs`) |

## Files

| Path | Purpose |
|------|---------|
| `src/index.mjs` | Entry point: loads keys and starts server |
| `src/app.mjs` | Express app factory |
| `src/config/index.mjs` | Port, version, model list |
| `src/auth.mjs` | API key loading / auth middleware helper |
| `src/session.mjs` | Per-user session get / rotate-on-429 |
| `src/retry.mjs` | Shared backoff, error classify, session rewrite |
| `src/client.mjs` | Zen API HTTP request builders |
| `src/to-openai.mjs` | Anthropic → OpenAI format converter |
| `src/to-anthropic.mjs` | OpenAI → Anthropic format converter |
| `src/pipe-openai.mjs` | OpenAI-format response pipe (stream + sync) |
| `src/pipe-anthropic.mjs` | Anthropic-format SSE stream pipe |
| `src/logger.mjs` | I/O logging utilities |
| `src/routes/*.mjs` | Route handlers |
| `models.json` | List of available models |
| `api-keys.json` | Auto-generated, **never commit** |
| `Dockerfile` | Multi-stage, `npm ci` + lockfile, non-root `node`, HEALTHCHECK |
| `docker-compose.yaml` | Production: read-only rootfs, cap_drop ALL, no-new-privileges |
| `docker-compose.dev.yaml` | Development compose with bind-mount |
| `.omo/` | OpenCode plans (gitignored) |

## Style

- No TypeScript, no lint config — just raw JS with Express.
- `console.log` for logging (no structured logger).
- Format conversion helpers (`anthropicToOpenAI`, `openAIToAnthropic`) and response pipes (`pipeZenResponse`, `pipeZenAsAnthropic`) are the main complexity — preserve behavior when touching.
