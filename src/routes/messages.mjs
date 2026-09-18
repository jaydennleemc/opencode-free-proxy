import { Router } from "express";
import { MODELS } from "../config/index.mjs";
import { auth } from "../auth.mjs";
import { getPool } from "../session-pool.mjs";
import { runPrompt, writeSseHeaders, clientGone } from "../pipeline.mjs";
import { anthropicToOpenAI } from "../to-openai.mjs";
import { openAIToPrompt } from "../convert.mjs";
import { toAnthropicMessage, anthropicStreamEvents } from "../translate.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

router.post("/v1/messages", async (req, res) => {
  const user = auth(req);
  if (!user) {
    return res.status(401).json({
      type: "error",
      error: { type: "authentication_error", message: "Invalid API key" },
    });
  }

  if (req.body == null || typeof req.body !== "object") {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: "Request body must be JSON" },
    });
  }

  const { model, stream } = req.body;
  if (!MODELS.includes(model)) {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: `Unknown model: ${model}. Available: ${MODELS.join(", ")}` },
    });
  }

  const { messages } = anthropicToOpenAI(req.body);
  const { system, history, text } = openAIToPrompt(messages);
  const inputTokens = (JSON.stringify(messages).length / 4) | 0;

  logLine(user, model, stream ? "stream" : "sync", "msgs:", JSON.stringify(msgSummary(messages)));
  logIO("INPUT", {
    model,
    stream: !!stream,
    system: req.body.system,
    messages: req.body.messages,
  });

  try {
    const pool = getPool(user);
    const { info, parts } = await runPrompt(pool, {
      model,
      system,
      history,
      text,
      gone: () => clientGone(req, res),
    });

    if (stream) {
      writeSseHeaders(res);
      for (const [event, data] of anthropicStreamEvents(model, info, parts, inputTokens)) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
      res.end();
      logIO("OUTPUT (stream)", parts.filter((p) => p.type === "text").map((p) => p.text).join(""));
      return;
    }

    const message = toAnthropicMessage(model, info, parts, inputTokens);
    logIO("OUTPUT (sync)", message);
    res.json(message);
  } catch (e) {
    logLine("ERROR", e.message);
    logIO("OUTPUT (error)", { error: e.message });
    if (res.headersSent) return res.end();
    const status = e.status === 429 ? 429 : e.status >= 400 && e.status < 600 ? e.status : 502;
    res.status(status).json({
      type: "error",
      error: { type: status === 429 ? "rate_limit_error" : "upstream_error", message: e.message },
    });
  }
});

export default router;
