import { RETRY_BASE_MS, RETRY_MAX_MS } from "./config/index.mjs";

/** Exponential backoff with ±20% jitter. attemptIndex 0 = first retry. */
export function rateLimitRetryDelay(attemptIndex, baseMs = RETRY_BASE_MS, maxMs = RETRY_MAX_MS) {
  const exp = Math.max(0, attemptIndex | 0);
  const base = Math.min(maxMs, baseMs * 2 ** exp);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.min(maxMs, Math.round(base + jitter)));
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
