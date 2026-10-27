# opencode-free-proxy

Free AI models from [OpenCode](https://opencode.ai) exposed as standard OpenAI, Anthropic, and Response APIs.

One server — works with any tool that speaks OpenAI, Anthropic, or Response API format: Cursor, Continue, Cline, Claude Code, aider, opencode CLI, raw `curl`, whatever.

## 30-second setup

```bash
git clone https://github.com/bigdata2211it-web/opencode-free-proxy.git
cd opencode-free-proxy
bun install
npm start   # runs `bun src/index.mjs` — Bun is required, see below
```

> **Why Bun?** The free-tier gate fingerprints the client's TLS stack. Node's
> `https`/`http2` get `429 FreeUsageLimitError` even with byte-identical
> bodies/headers; only Bun's `fetch` passes. Everything else (tests, metrics)
> still works in Node.

Done. Server is at `http://localhost:6446`. API keys are in `api-keys.json` (auto-generated on first run).

The proxy talks to `opencode.ai/inference` directly with the official-client fingerprint (v2.1.4: headers + the official agent system prompt) the free tier requires.

## What you get

The proxy serves the free models from OpenCode's catalog (check `/v1/models` at runtime for the authoritative list), e.g. `glm-5.3-flash-free`, `kimi-k2.5-free`, `minimax-m3.1-flash-free`, `nemotron-3-ultra-free`, `beam-free`, `big-pickle`.

All models support streaming, system messages, and tool calling. Your own tool names are forwarded; the proxy injects the four OpenCode fingerprint tools (`bash`, `glob`, `grep`, `read`) if missing.

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

### Response API format — `POST /v1/responses`

```bash
curl http://localhost:6446/v1/responses \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-free",
    "instructions": "You are helpful.",
    "input": "Hello",
    "stream": true
  }'
```

Supports the full OpenAI Response API input/output shape: `instructions`, `input` (string or array), `tools`, `tool_choice`, `max_output_tokens`, `temperature`, `top_p`. Streaming emits the standard `response.created` → `response.content_part.delta` → `response.completed` event sequence.

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
| `GET` | `/v1/metrics?range=1h\|24h\|7d\|30d` | Aggregated request/token metrics |
| `GET` | `/health` | Health + opencode status |

### Auth

Both `Authorization: Bearer KEY` and `x-api-key: KEY` work on all endpoints.

## Docker

Pull from Docker Hub, or build yourself:

```bash
docker run -d --name opencode-proxy -p 3000:3000 -p 6446:6446 -v proxy-data:/data jaydennleemc/opencode-proxy:latest
```

One container runs both the proxy (API on `6446`) and the metrics dashboard
(web UI on `3000`):

```bash
docker build -t jaydennleemc/opencode-proxy .
docker run -d --name opencode-proxy -p 3000:3000 -p 6446:6446 -v proxy-data:/data jaydennleemc/opencode-proxy
```

- Dashboard: `http://localhost:3000` (the only port you need for the web UI)
- API: `http://localhost:6446/v1` — publish `6446` only if your API clients run outside the container
- API keys and the metrics DB persist in the `proxy-data` volume; the dashboard picks up a key automatically

Or with compose:

```bash
docker compose up -d --build
# API keys persist in the proxy-data volume:
docker exec opencode-free-proxy cat /data/api-keys.json
```

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
        │  HTTPS  POST /zen/v1/chat/completions
        ▼
  opencode.ai/zen            ← free tier
```

The free-tier gate (`FreeTierError: OpenCode's free tier can only be used from within OpenCode`) is **not** encrypted inference. It fingerprints the official client on four axes:

1. `User-Agent: opencode/<version>` with version ≥ 1.17
2. Canonical `x-opencode-session` / `x-opencode-request` ids (`prefix_` + 12 hex time bytes + 14 base62)
3. Request body includes tools named `{bash, glob, grep, read}` (extras allowed)
4. `stream: true` (non-stream is 403)

v0.2 talks to Zen directly: forces `stream: true` upstream, injects any missing fingerprint tools (Cursor's own tools are kept), and folds SSE back into JSON for sync clients. An earlier serve-spawn experiment still 403'd Cursor — that path is gone.

On 429 the session id is rotated (fresh free-tier quota) and the request retried with backoff.

## License

MIT
