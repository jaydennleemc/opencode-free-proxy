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
- **Session rotation** — per-user sessions rotate every 30 minutes (internal, no-op for agent work).
- **Only dependency** — `express` (listed in package.json, no lockfile committed).

## Env vars

| Variable | Default | Notes |
|----------|---------|-------|
| `PROXY_PORT` | `6446` | Server listen port |
| `KEYS_FILE` | `./api-keys.json` | Auto-created if missing |

## Files

| Path | Purpose |
|------|---------|
| `src/index.mjs` | Entry point: loads keys and starts server |
| `src/app.mjs` | Express app factory |
| `src/config/index.mjs` | Port, version, model list |
| `src/auth.mjs` | API key loading / auth middleware helper |
| `src/session.mjs` | Per-user session rotation |
| `src/zen.mjs` | Zen API request builders |
| `src/converters.mjs` | Anthropic ⇄ OpenAI format converters |
| `src/pipes.mjs` | Stream / sync response forwarding |
| `src/routes/*.mjs` | Route handlers |
| `src/logger.mjs` | I/O logging utilities |
| `models.json` | List of available models |
| `api-keys.json` | Auto-generated, **never commit** |
| `Dockerfile` | Multi-stage, `node:24-alpine`, runs as `node` user |
| `docker-compose.yaml` | Production compose |
| `docker-compose.dev.yaml` | Development compose with bind-mount |
| `.omo/` | OpenCode plans (gitignored) |

## Style

- No TypeScript, no lint config — just raw JS with Express.
- `console.log` for logging (no structured logger).
- Format conversion helpers (`anthropicToOpenAI`, `openAIToAnthropic`) and response pipes (`pipeZenResponse`, `pipeZenAsAnthropic`) are the main complexity — preserve behavior when touching.
