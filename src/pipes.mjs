import https from "https";
import { logLine, logIO, parseOpenAIStreamOutput, parseOpenAISyncOutput } from "./logger.mjs";
import { ocId } from "./utils.mjs";

function checkFirstChunkError(chunk) {
  const str = chunk.toString().trim();
  if (!str.startsWith("{") || (!str.includes("FreeUsageLimitError") && !str.includes('"error"'))) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.error || parsed.type === "error") {
      return parsed.error?.message || parsed.message || "Rate limit exceeded";
    }
  } catch {}
  return null;
}

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

export function pipeZenAsAnthropic(zenOpts, body, model, res, inputTokens) {
  const msgId = ocId("msg");
  const t0 = Date.now();
  let collectedText = "";
  const collectedTools = {};
  let stopReasonLogged = null;

  const req = https.request(zenOpts, (zenRes) => {
    let headersSent = false;
    let buffer = "";
    let outputTokens = 0;
    let contentIdx = 0;
    let toolIdx = -1;
    let firstChunkHandled = false;

    function sendSSE(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (res.flush) res.flush();
    }

    function sendHeaders() {
      if (headersSent) return;
      headersSent = true;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      sendSSE("message_start", {
        type: "message_start",
        message: {
          id: msgId, type: "message", role: "assistant", content: [],
          model, stop_reason: null,
          usage: { input_tokens: inputTokens || 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      });
    }

    zenRes.on("data", (chunk) => {
      const str = chunk.toString();

      if (!firstChunkHandled) {
        firstChunkHandled = true;
        const errMsg = checkFirstChunkError(chunk);
        if (errMsg) {
          logLine("RATE LIMITED", errMsg);
          logIO("OUTPUT (rate_limit)", { error: errMsg });
          if (!res.headersSent) {
            res.writeHead(429, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              type: "error",
              error: { type: "rate_limit_error", message: errMsg + " (free model rate limit)" },
            }));
          }
          zenRes.resume();
          return;
        }
      }

      buffer += str;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;

        let parsed;
        try { parsed = JSON.parse(payload); } catch { continue; }
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        sendHeaders();

        if (delta.content) {
          collectedText += delta.content;
          if (contentIdx === 0 && toolIdx === -1) {
            sendSSE("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
            contentIdx = 1;
          }
          sendSSE("content_block_delta", {
            type: "content_block_delta", index: 0,
            delta: { type: "text_delta", text: delta.content },
          });
          outputTokens += Math.ceil(delta.content.length / 4);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (idx > toolIdx) {
              if (toolIdx === -1 && contentIdx > 0) {
                sendSSE("content_block_stop", { type: "content_block_stop", index: 0 });
              }
              toolIdx = idx;
              const blockIdx = contentIdx > 0 ? idx + 1 : idx;
              const toolId = tc.id || ocId("toolu");
              collectedTools[idx] = { id: toolId, name: tc.function?.name || "", arguments: "" };
              sendSSE("content_block_start", {
                type: "content_block_start", index: blockIdx,
                content_block: { type: "tool_use", id: toolId, name: tc.function?.name || "" },
              });
            }
            if (tc.function?.arguments) {
              if (collectedTools[idx]) collectedTools[idx].arguments += tc.function.arguments;
              const blockIdx = contentIdx > 0 ? idx + 1 : idx;
              sendSSE("content_block_delta", {
                type: "content_block_delta", index: blockIdx,
                delta: { type: "input_json_delta", partial_json: tc.function.arguments },
              });
              outputTokens += Math.ceil(tc.function.arguments.length / 4);
            }
          }
        }

        if (parsed.choices?.[0]?.finish_reason) {
          const fr = parsed.choices[0].finish_reason;
          const totalBlocks = (contentIdx > 0 ? 1 : 0) + (toolIdx >= 0 ? toolIdx + 1 : 0);
          for (let i = 0; i < totalBlocks; i++) {
            sendSSE("content_block_stop", { type: "content_block_stop", index: i });
          }

          let stopReason = "end_turn";
          if (fr === "tool_calls") stopReason = "tool_use";
          else if (fr === "length") stopReason = "max_tokens";
          stopReasonLogged = stopReason;

          sendSSE("message_delta", {
            type: "message_delta",
            delta: { stop_reason: stopReason },
            usage: { output_tokens: outputTokens },
          });
          sendSSE("message_stop", { type: "message_stop" });
        }
      }
    });

    zenRes.on("end", () => {
      if (!headersSent) {
        logIO("OUTPUT (empty)", { error: "Empty response" });
        if (!res.headersSent) {
          res.status(502).json({ type: "error", error: { type: "upstream_error", message: "Empty response" } });
        }
        return;
      }
      const ms = Date.now() - t0;
      const out = {
        content: collectedText || null,
        stop_reason: stopReasonLogged,
        output_tokens: outputTokens,
      };
      const tools = Object.values(collectedTools);
      if (tools.length) out.tool_calls = tools;
      logIO(`OUTPUT (stream, ${ms}ms)`, out);
      res.end();
    });
  });

  req.on("error", (e) => {
    logLine("ERROR", e.message);
    logIO("OUTPUT (error)", { error: e.message });
    if (!res.headersSent) {
      res.status(502).json({ type: "error", error: { type: "upstream_error", message: e.message } });
    }
  });

  req.on("timeout", () => {
    req.destroy();
    logLine("TIMEOUT");
    logIO("OUTPUT (timeout)", { error: "Upstream timeout" });
    if (!res.headersSent) {
      res.status(504).json({ type: "error", error: { type: "timeout_error", message: "Upstream timeout" } });
    }
  });

  req.write(body);
  req.end();
}
