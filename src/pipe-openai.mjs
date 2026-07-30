import https from "https";
import { logLine, logIO } from "./logger.mjs";
import { ocId, checkFirstChunkError } from "./utils.mjs";

// ── shared helpers ─────────────────────────────────────────────────────────

export function ensureOpenAIIds(payload, toolCallIds = {}, model = "") {
  if (typeof payload.object !== "string" || !payload.object) {
    payload.object = "chat.completion";
  }
  if (typeof payload.id !== "string" || !payload.id) {
    payload.id = ocId("chatcmpl");
  }
  if (typeof payload.created !== "number") {
    payload.created = Math.floor(Date.now() / 1000);
  }
  if (typeof payload.model !== "string" || !payload.model) {
    payload.model = model || payload.model || "";
  }
  const choice = payload.choices?.[0];
  const tcs = choice?.delta?.tool_calls ?? choice?.message?.tool_calls;
  if (Array.isArray(tcs)) {
    tcs.forEach((tc, arrayIdx) => {
      const idx = tc.index ?? arrayIdx;
      if (tc.id) {
        toolCallIds[idx] = tc.id;
      } else {
        tc.id = toolCallIds[idx] ??= ocId("call");
      }
      if (!tc.type) tc.type = "function";
    });
  }
  return payload;
}

// ── response parsers (for logging) ─────────────────────────────────────────

/** Reconstruct assistant text + tool_calls from OpenAI SSE stream bytes. */
export function parseOpenAIStreamOutput(raw) {
  let content = "";
  const toolCalls = {};
  let finishReason = null;
  let usage = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    let parsed;
    try { parsed = JSON.parse(payload); } catch { continue; }
    if (parsed.usage) usage = parsed.usage;
    const choice = parsed.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || choice.message;
    if (!delta) continue;
    if (delta.content) content += delta.content;
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        if (!toolCalls[i]) toolCalls[i] = { id: tc.id || "", name: "", arguments: "" };
        if (tc.id) toolCalls[i].id = tc.id;
        if (tc.function?.name) toolCalls[i].name = tc.function.name;
        if (tc.function?.arguments) toolCalls[i].arguments += tc.function.arguments;
      }
    }
  }
  const out = { content };
  const tcs = Object.values(toolCalls);
  if (tcs.length) out.tool_calls = tcs;
  if (finishReason) out.finish_reason = finishReason;
  if (usage) out.usage = usage;
  return out;
}

export function parseOpenAISyncOutput(data) {
  if (!data) return { raw: null };
  const choice = data.choices?.[0];
  const out = {
    content: choice?.message?.content ?? null,
    finish_reason: choice?.finish_reason ?? null,
    usage: data.usage ?? null,
  };
  if (choice?.message?.tool_calls?.length) {
    out.tool_calls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    }));
  }
  return out;
}

// ── main pipe ──────────────────────────────────────────────────────────────

/**
 * Relay an OpenAI-format request to the Zen API and pipe the response back
 * in OpenAI format (supports both streaming SSE and sync JSON).
 */
export function pipeZenResponse(zenOpts, body, stream, res) {
  const chunks = [];
  const t0 = Date.now();
  const toolCallIds = {};
  let requestModel = "";
  try { requestModel = JSON.parse(body).model || ""; } catch {}
  const req = https.request(zenOpts, (zenRes) => {
    let firstChunk = null;
    let headersSent = false;
    let rateLimited = false;
    let sseBuffer = "";

    function sendHeaders() {
      if (headersSent) return;
      headersSent = true;
      if (stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "Transfer-Encoding": "chunked",
        });
        res.flushHeaders();
      } else {
        res.writeHead(zenRes.statusCode, { "Content-Type": "application/json" });
      }
    }

    function flushSseBuffer(final = false) {
      if (!stream) return;
      const lines = sseBuffer.split("\n");
      sseBuffer = final ? "" : (lines.pop() || "");
      for (const line of lines) {
        const out = transformSseLine(line);
        chunks.push(Buffer.from(out + "\n"));
        res.write(out + "\n");
      }
      if (final && sseBuffer) {
        const out = transformSseLine(sseBuffer);
        chunks.push(Buffer.from(out + "\n"));
        res.write(out + "\n");
      }
      if (res.flush) res.flush();
    }

    function transformSseLine(line) {
      if (!line.startsWith("data: ")) return line;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") return line;
      try {
        const parsed = JSON.parse(payload);
        const updated = ensureOpenAIIds(parsed, toolCallIds, requestModel);
        return "data: " + JSON.stringify(updated);
      } catch {
        return line;
      }
    }

    zenRes.on("data", (chunk) => {
      if (!firstChunk) {
        firstChunk = chunk;
        const errMsg = checkFirstChunkError(chunk);
        if (errMsg) {
          rateLimited = true;
          logLine("RATE LIMITED", errMsg);
          logIO("OUTPUT (rate_limit)", { error: errMsg });
          if (!res.headersSent) {
            res.status(429).json({
              error: { message: errMsg + " (free model rate limit)", type: "rate_limit_error", code: "rate_limit_exceeded" }
            });
          }
          zenRes.resume();
          return;
        }

        sendHeaders();
        if (stream) {
          sseBuffer += chunk.toString();
          flushSseBuffer();
        } else {
          chunks.push(chunk);
        }
        return;
      }
      if (headersSent) {
        if (stream) {
          sseBuffer += chunk.toString();
          flushSseBuffer();
        } else {
          chunks.push(chunk);
        }
      }
    });

    zenRes.on("end", () => {
      if (rateLimited) return;
      if (!headersSent && !firstChunk) {
        logLine("EMPTY", "No response from Zen API");
        logIO("OUTPUT (empty)", { error: "Empty response from upstream" });
        if (!res.headersSent) {
          res.status(502).json({ error: { message: "Empty response from upstream", type: "upstream_error" } });
        }
        return;
      }
      if (headersSent) {
        const ms = Date.now() - t0;
        if (stream) {
          flushSseBuffer(true);
          const raw = Buffer.concat(chunks).toString();
          logIO(`OUTPUT (stream, ${ms}ms)`, parseOpenAIStreamOutput(raw));
          res.end();
        } else {
          const raw = Buffer.concat(chunks).toString();
          try {
            const parsed = JSON.parse(raw);
            const updated = ensureOpenAIIds(parsed, toolCallIds, requestModel);
            const rawUpdated = JSON.stringify(updated);
            logIO(`OUTPUT (sync, ${ms}ms)`, parseOpenAISyncOutput(updated));
            res.end(rawUpdated);
          } catch {
            logIO(`OUTPUT (sync raw, ${ms}ms)`, raw);
            res.end(raw);
          }
        }
      }
    });
  });

  req.on("error", (e) => {
    logLine("ERROR", e.message);
    logIO("OUTPUT (error)", { error: e.message });
    if (!res.headersSent) {
      res.status(502).json({ error: { message: "Upstream error: " + e.message, type: "upstream_error" } });
    }
  });

  req.on("timeout", () => {
    req.destroy();
    logLine("TIMEOUT");
    logIO("OUTPUT (timeout)", { error: "Upstream timeout" });
    if (!res.headersSent) {
      res.status(504).json({ error: { message: "Upstream timeout", type: "timeout_error" } });
    }
  });

  req.write(body);
  req.end();
}
