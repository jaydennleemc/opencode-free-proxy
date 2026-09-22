import https from "https";
import { MAX_RETRIES } from "./config/index.mjs";
import { logLine, logIO, LOG_DETAIL } from "./logger.mjs";
import {
  parseErrorPayload,
  planRetry,
  logAndScheduleRetry,
  isClientGone,
  isTransientNetworkError,
  isTransientHttpStatus,
  withFreshSession,
  withFreshRequestId,
} from "./retry.mjs";
import {
  streamingState,
  buildFinalResponse,
  processStreamDelta,
  openAIToResponse,
} from "./to-response.mjs";
import {
  aggregateSseToCompletion,
  ensureOpenAIIds,
} from "./pipe-openai.mjs";

// ── main pipe ──────────────────────────────────────────────────────────────

/**
 * Relay an OpenAI-format request to the Zen API and pipe the response back
 * in the OpenAI Response API SSE format (response.created → … → response.completed).
 * Retries on rate-limit / transient errors with backoff; rotates session on 429.
 *
 * @param {object} ctx
 * @param {string} [ctx.user]   API-key user id (for session rotation)
 * @param {import("http").IncomingMessage} [ctx.clientReq]  client abort detection
 * @param {number} [ctx.retries]
 */
export function pipeZenAsResponse(
  zenOpts,
  body,
  model,
  stream,
  res,
  inputTokens,
  ctx = {},
) {
  const { user, clientReq, retries = MAX_RETRIES } = ctx;
  let requestModel = model;
  try {
    requestModel = JSON.parse(body).model || model;
  } catch {}

  let currentOpts = zenOpts;
  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) aborted = true;
  });

  function gone() {
    return aborted || isClientGone(clientReq, res);
  }

  function attempt(remaining) {
    if (gone()) {
      logLine("CLIENT GONE, stop attempt");
      return;
    }

    const chunks = [];
    const t0 = Date.now();
    let sseBuffer = "";
    let headersSent = false;
    let terminalHandled = false;
    let intentionalClose = false;
    let skipEnd = false;
    let sentResponseCreated = false;

    const state = streamingState(requestModel);
    state.inputTokens = inputTokens;

    let streamLogLines = LOG_DETAIL ? "" : null;

    function failRateLimit(errMsg) {
      if (terminalHandled || res.headersSent) return;
      terminalHandled = true;
      logLine("RATE LIMITED, exhausted retries", errMsg);
      logIO("OUTPUT (rate_limit)", { error: errMsg });
      res
        .writeHead(429, { "Content-Type": "application/json" })
        .end(
          JSON.stringify({
            type: "error",
            error: {
              type: "rate_limit_error",
              message: errMsg + " (free model rate limit)",
            },
          }),
        );
    }

    function failUpstream(status, errMsg, type = "upstream_error") {
      if (terminalHandled || res.headersSent) return;
      terminalHandled = true;
      logLine("UPSTREAM ERROR", errMsg);
      logIO("OUTPUT (error)", { error: errMsg });
      res
        .status(status)
        .json({ type: "error", error: { type, message: errMsg } });
    }

    function trySchedule(kind, errMsg, headers) {
      if (gone()) {
        logLine("CLIENT GONE, aborting retries");
        intentionalClose = true;
        return true;
      }
      const plan = planRetry({ remaining, retries, kind, headers, errMsg });
      if (!plan) return false;
      intentionalClose = true;
      logAndScheduleRetry(plan, remaining, (delay) => {
        setTimeout(() => {
          if (gone()) return;
          if (plan.rotateSession && user) {
            currentOpts = withFreshSession(currentOpts, user);
          } else {
            currentOpts = withFreshRequestId(currentOpts);
          }
          attempt(remaining - 1);
        }, delay);
      });
      return true;
    }

    function handleRetryable(kind, errMsg) {
      if (trySchedule(kind, errMsg, zenRes.headers)) {
        skipEnd = true;
        zenRes.destroy();
        req.destroy();
        return true;
      }
      return false;
    }

    function sendSSE(event, data) {
      const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      if (streamLogLines !== null) streamLogLines += line;
      res.write(line);
      if (res.flush) res.flush();
    }

    function ensureHeaders() {
      if (headersSent) return;
      headersSent = true;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
    }

    function emitResponseCreated() {
      ensureHeaders();
      if (sentResponseCreated) return;
      sentResponseCreated = true;
      const emptyResp = {
        id: state.respId,
        object: "response",
        created_at: state.created_at,
        status: "in_progress",
        model: state.model,
        output: [],
        usage: {
          input_tokens: state.inputTokens,
          output_tokens: 0,
          total_tokens: state.inputTokens,
        },
        incomplete_details: null,
      };
      sendSSE("response.created", {
        type: "response.created",
        response: emptyResp,
      });
      sendSSE("response.in_progress", {
        type: "response.in_progress",
        response: emptyResp,
      });
    }

    function processSseLine(line) {
      if (!line.startsWith("data: ")) return;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return;
      }
      emitResponseCreated();
      processStreamDelta(state, parsed, (event, data) => sendSSE(event, data));
    }

    function flushSseBuffer() {
      if (!stream) return;
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        processSseLine(line);
      }
    }

    const req = https.request(currentOpts, (zenRes) => {
      const status = zenRes.statusCode || 0;
      let firstChunkHandled = false;

      zenRes.on("data", (chunk) => {
        if (skipEnd || terminalHandled) return;

        if (!firstChunkHandled) {
          firstChunkHandled = true;
          const errInfo = parseErrorPayload(chunk);
          const rateLimited = status === 429 || errInfo?.rateLimited;

          if (rateLimited) {
            const errMsg = errInfo?.message || "Rate limit exceeded";
            if (handleRetryable("rate_limit", errMsg)) return;
            failRateLimit(errMsg);
            zenRes.resume();
            skipEnd = true;
            return;
          }

          if (errInfo) {
            failUpstream(status >= 400 ? status : 502, errInfo.message);
            zenRes.resume();
            skipEnd = true;
            return;
          }

          if (isTransientHttpStatus(status)) {
            if (handleRetryable("transient", `HTTP ${status}`)) return;
            failUpstream(status, `Upstream HTTP ${status}`);
            zenRes.resume();
            skipEnd = true;
            return;
          }
        }

        if (stream) {
          sseBuffer += chunk.toString();
          flushSseBuffer();
        } else {
          chunks.push(chunk);
        }
      });

      zenRes.on("end", () => {
        if (skipEnd || terminalHandled) return;

        if (!headersSent) {
          if (status === 429) {
            if (handleRetryable("rate_limit", "Rate limit exceeded")) return;
            failRateLimit("Rate limit exceeded");
            return;
          }
          if (isTransientHttpStatus(status)) {
            if (handleRetryable("transient", `HTTP ${status}`)) return;
            failUpstream(status, `Upstream HTTP ${status}`);
            return;
          }
          logIO("OUTPUT (empty)", { error: "Empty response" });
          if (!res.headersSent) {
            res
              .status(502)
              .json({
                type: "error",
                error: { type: "upstream_error", message: "Empty response" },
              });
          }
          return;
        }

        const ms = Date.now() - t0;

        if (stream) {
          // Flush any remaining buffer
          if (sseBuffer) processSseLine(sseBuffer);
          sseBuffer = "";
          // If the upstream stream ended without a finish_reason event,
          // force a response.completed so the client isn't left hanging.
          if (!state.finishReason) {
            state.status = "completed";
            emitResponseCreated();
            sendSSE("response.completed", {
              type: "response.completed",
              response: buildFinalResponse(state),
            });
          }
          if (streamLogLines) logIO(`OUTPUT (stream, ${ms}ms)`, streamLogLines);
          res.end();
        } else {
          // Sync: aggregate full SSE into Response API JSON
          const raw = Buffer.concat(chunks).toString();
          const aggregated = aggregateSseToCompletion(raw, requestModel);
          ensureOpenAIIds(aggregated, {}, requestModel);
          const respApi = openAIToResponse(aggregated, requestModel);
          logIO(`OUTPUT (sync, ${ms}ms)`, respApi);
          res.status(200).json(respApi);
        }
      });
    });

    req.on("error", (e) => {
      if (intentionalClose || terminalHandled) return;
      if (remaining > 0 && isTransientNetworkError(e)) {
        if (trySchedule("transient", e.message)) return;
      }
      logLine("ERROR", e.message);
      logIO("OUTPUT (error)", { error: e.message });
      if (!res.headersSent) {
        res
          .status(502)
          .json({
            type: "error",
            error: { type: "upstream_error", message: e.message },
          });
      }
    });

    req.on("timeout", () => {
      if (intentionalClose || terminalHandled) return;
      intentionalClose = true;
      req.destroy();
      if (remaining > 0 && trySchedule("transient", "Upstream timeout")) return;
      intentionalClose = false;
      logLine("TIMEOUT");
      logIO("OUTPUT (timeout)", { error: "Upstream timeout" });
      if (!res.headersSent) {
        res
          .status(504)
          .json({
            type: "error",
            error: { type: "timeout_error", message: "Upstream timeout" },
          });
      }
    });

    req.write(body);
    req.end();
  }

  attempt(retries);
}
