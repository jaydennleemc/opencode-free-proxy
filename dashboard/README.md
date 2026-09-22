# opencode-free-proxy dashboard

Next.js 16 + Tailwind CSS v4 dashboard for the proxy's token-usage metrics.
Reads aggregated data from the proxy's `GET /v1/metrics` endpoint — the proxy
API key stays server-side and is never sent to the browser.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in PROXY_URL and PROXY_API_KEY
npm run dev                  # http://localhost:3000
```

| Env var         | Default                   | Notes                                  |
| --------------- | ------------------------- | -------------------------------------- |
| `PROXY_URL`     | `http://localhost:6446`   | Base URL of the proxy to monitor       |
| `PROXY_API_KEY` | — (required)              | Any key from the proxy's api-keys.json |

## What it shows

Tokens, requests, error rate, and average latency; tokens over time; per-model
and per-key breakdowns; recent errors. Ranges: 1h / 24h / 7d / 30d, polled
every 5 seconds.

## Architecture

```
Browser ──poll 5s──▶ app/api/metrics (Route Handler, holds PROXY_API_KEY)
                          ▼
                   proxy GET /v1/metrics?range=… ──▶ metrics.db (SQLite)
```
