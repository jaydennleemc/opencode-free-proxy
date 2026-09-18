# opencode-free-proxy

Free AI models from [OpenCode](https://opencode.ai) exposed as standard OpenAI and Anthropic APIs.

One server — works with any tool that speaks OpenAI or Anthropic format: Cursor, Continue, Cline, Claude Code, aider, opencode CLI, raw `curl`, whatever.

## 30-second setup

```bash
git clone https://github.com/bigdata2211it-web/opencode-free-proxy.git
cd opencode-free-proxy
npm install
npm start
```

Done. Server is at `http://localhost:6446`. API keys are in `api-keys.json` (auto-generated on first run).

`npm install` pulls the `opencode` binary (~100MB) as a dependency — the proxy spawns `opencode serve` and routes all completions through it.

## What you get

The server currently serves these free models (check `/v1/models` at runtime for the authoritative list):

| Model | Description |
|-------|-------------|
| `mimo-v2.5-free` | Xiaomi MiMo V2.5 |
| `nemotron-3-ultra-free` | NVIDIA Nemotron 3 Ultra |
| `nemotron-3.5-lightning-free` | NVIDIA Nemotron 3.5 Lightning |
| `ling-3.0-flash-fin-free` | Ling 3.0 Flash Fin |
| `big-pickle` | Big Pickle |
| `muse-spark-1.2-contributor-free` | Muse Spark 1.2 |
| `muse-spark-1.3-contributor-free` | Muse Spark 1.3 |

All models support streaming and system messages. **Tool calling is flattened to text** — the local opencode session can't run client-side tool loops, so `tools` in the request are ignored and history `tool_calls` / `tool_result` messages are inlined as transcript text.

## API

### OpenAI format — `POST /v1/chat/completions`

```bash
curl http://localhost:6446/v1/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-free",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

### Anthropic format — `POST /v1/messages`

```bash
curl http://localhost:6446/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-free",
    "system": "You are helpful.",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1024,
    "stream": true
  }'
```

### Other endpoints

| Method | Path | What |
|--------|------|------|
| `GET` | `/v1/models` | List models |
| `GET` | `/health` | Health + opencode status |

### Auth

Both `Authorization: Bearer KEY` and `x-api-key: KEY` work on all endpoints.

## Docker

```bash
docker compose up -d --build
# API keys persist in the proxy-data volume:
docker exec opencode-free-proxy cat /data/api-keys.json
```

The image bundles the opencode binary; no host install needed.

## Use with tools

### Cursor / Continue / Cline

- Base URL: `http://YOUR_HOST:6446/v1`
- API Key: your key from `api-keys.json`
- Model: `mimo-v2.5-free`

### Claude Code (Anthropic format)

- Base URL: `http://YOUR_HOST:6446`
- API Key: your key from `api-keys.json`

## Environment variables

| Variable | Default | What |
|----------|---------|------|
| `PROXY_PORT` | `6446` | Proxy listen port |
| `KEYS_FILE` | `./api-keys.json` | API keys file path |
| `OPENCODE_PORT` | `4096` | Port for the spawned `opencode serve` |
| `OPENCODE_AGENT` | `build` | Agent name sent with prompts. **Must be a native opencode agent** — the free tier rejects custom agents. |
| `OPENCODE_BIN` | — | Override path to the opencode binary |
| `OC_TIMEOUT_MS` | `120000` | Max wait for one prompt reply |
| `SESSION_POOL_SIZE` | `4` | Concurrent sessions per API-key user |
| `MAX_RETRIES` | `12` | Rate-limit / transient retries after first attempt |
| `RETRY_BASE_MS` | `1000` | First retry delay; doubles each attempt |
| `RETRY_MAX_MS` | `30000` | Backoff cap |
| `LOG_DETAIL` | `1` | `0` disables full I/O dumps |
| `LOG_MAX_CHARS` | `0` | Truncate logged payloads (0 = unlimited) |
| `NO_COLOR` / `FORCE_COLOR` | — | ANSI color control |

## How it works

```
Your tool (Cursor, CLI, curl, etc.)
        │
        ▼
  opencode-free-proxy        ← this server, translates formats
        │  POST /session/{id}/message
        ▼
  opencode serve             ← local instance, spawned by the proxy
        │  HTTPS
        ▼
  opencode.ai/zen            ← free tier (only accepts the real client)
```

v0.1 talked to `opencode.ai/zen/v1` directly with reverse-engineered headers. As of 2026-09-16 OpenCode moved the free-tier check into their closed-source inference layer and rejects anything that isn't a genuine opencode session (`FreeTierError: OpenCode's free tier can only be used from within OpenCode`). So v0.2 runs a real `opencode serve` under the hood and relays through its session API — the upstream gate stays satisfied no matter how it evolves.

Per request the proxy: acquires a session from a per-user pool → replays prior history via `noReply` prompts (context caching) → sends the final user message → translates the reply into OpenAI or Anthropic shape. On 429 the session is rotated (fresh free-tier quota) and the request retried with backoff.

## License

MIT
