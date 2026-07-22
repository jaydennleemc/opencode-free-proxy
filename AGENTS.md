# opencode-free-proxy

Single-file Node.js Express proxy that translates OpenAI/Anthropic API calls to the Zen API at `opencode.ai`.

## Quick start

```bash
npm install
node server.mjs                    # port 6446
# or with file watching:
npm run dev
```

API keys are auto-generated into `api-keys.json` on first run — no `.env` setup needed.

## Key facts

- **ESM only** — `"type": "module"` in package.json; use `import` not `require`.
- **No build step** — raw Node.js, no TypeScript, no bundler.
- **No tests** — `npm test` does not exist.
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
| `server.mjs` | Entire application (~565 lines) |
| `models.json` | List of available models |
| `api-keys.json` | Auto-generated, **never commit** |
| `Dockerfile` | Multi-stage, runs as `node` user |
| `.omo/` | OpenCode plans (gitignored) |

## Style

- No TypeScript, no lint config — just raw JS with Express.
- `console.log` for logging (no structured logger).
- Format conversion helpers (`anthropicToOpenAI`, `openAIToAnthropic`, `pipeZenAsAnthropic`) are the main complexity — preserve them when touching.
