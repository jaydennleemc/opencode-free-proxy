import { cacheMessages, sendPrompt, abortSession } from "./oc-client.mjs";
import { OC_TIMEOUT_MS } from "./config/index.mjs";
import { rateLimitRetryDelay, sleep } from "./retry.mjs";
import { logLine, logIO } from "./logger.mjs";

const MAX_RETRIES = Math.max(0, Number(process.env.MAX_RETRIES) || 12);

/** Throw with HTTP-ish status so callers can fail the client request. */
function upstreamError(message, status = 502) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Classify an opencode assistant error / HTTP failure. */
function classify(err, info) {
  const e = info?.error;
  const msg = e?.data?.message || err?.message || "Upstream error";
  const retryable = e?.data?.isRetryable === true;
  const statusCode = e?.data?.statusCode || err?.status || 0;
  const rateLimited = statusCode === 429 || /rate.?limit|FreeUsageLimit/i.test(msg);
  return { msg, retryable, statusCode, rateLimited };
}

/**
 * Run one completion through a pooled opencode session:
 *   1. noReply-cache prior history
 *   2. sendPrompt the last user message
 *   3. rotate session + retry on 429 / transient errors
 *
 * @returns {Promise<{info: object, parts: Array}>} the assistant message + parts
 */
export async function runPrompt(pool, { model, system, history, text, gone }) {
  if (!text) throw upstreamError("No user message in request", 400);

  let session = await pool.acquire();
  let waiter;
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (gone?.()) throw upstreamError("Client disconnected", 499);

      try {
        if (history?.length) {
          logLine("CACHE", history.length, "messages →", session.id);
          await cacheMessages(
            session.id,
            model,
            history.map((m) => ({ type: "text", text: `${m.role}: ${m.content}` })),
          );
        }
        const result = await sendPrompt(session.id, model, text, system, OC_TIMEOUT_MS);
        const err = result?.info?.error;
        if (!err) return result;

        // assistant-level error (rate limit, upstream API error, …)
        const c = classify(null, result.info);
        if ((c.rateLimited || c.retryable) && attempt < MAX_RETRIES) {
          const delay = rateLimitRetryDelay(attempt);
          logLine(`RETRY (${MAX_RETRIES - attempt} left, wait ${delay}ms)`, c.msg);
          pool.discard(session, c.rateLimited ? "rate-limit" : "retryable");
          session = await pool.acquire();
          await sleep(delay);
          continue;
        }
        throw upstreamError(c.msg, c.rateLimited ? 429 : c.statusCode >= 400 ? c.statusCode : 502);
      } catch (e) {
        if (e.status && e.status < 500) throw e; // our own 4xx (e.g. no user message)
        if (e.code === "OC_TIMEOUT") {
          logLine("PROMPT TIMEOUT, rotating session", session.id);
          abortSession(session.id).catch(() => {});
          pool.discard(session, "timeout");
          if (attempt >= MAX_RETRIES) throw upstreamError("Upstream timeout", 504);
          session = await pool.acquire();
          continue;
        }
        // HTTP-level failure from opencode serve itself
        const c = classify(e, null);
        if ((c.rateLimited || isTransient(c.statusCode)) && attempt < MAX_RETRIES) {
          const delay = rateLimitRetryDelay(attempt);
          logLine(`RETRY (${MAX_RETRIES - attempt} left, wait ${delay}ms)`, c.msg);
          if (c.rateLimited) {
            pool.discard(session, "rate-limit");
            session = await pool.acquire();
          }
          await sleep(delay);
          continue;
        }
        throw upstreamError(c.msg, c.rateLimited ? 429 : c.statusCode >= 400 ? c.statusCode : 502);
      }
    }
    throw upstreamError("Rate limit retries exhausted", 429);
  } finally {
    if (session) pool.release(session);
    waiter?.cancel?.();
  }
}

function isTransient(status) {
  return status === 502 || status === 503 || status === 504 || status === 0;
}

// ── output helpers (shared by both routes) ──────────────────────────────────

export function writeSseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function clientGone(req, res) {
  return req.aborted || res.writableEnded || res.destroyed;
}

export { logIO };
