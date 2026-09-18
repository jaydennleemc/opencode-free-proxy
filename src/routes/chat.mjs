import { Router } from "express";
import { MODELS } from "../config/index.mjs";
import { auth } from "../auth.mjs";
import { getPool } from "../session-pool.mjs";
import { runPrompt, writeSseHeaders, clientGone } from "../pipeline.mjs";
import { openAIToPrompt } from "../convert.mjs";
import {
  toOpenAICompletion,
  openAIStreamChunks,
} from "../translate.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

router.post("/v1/chat/completions", async (req, res) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ error: { message: "Invalid API key" } });

  if (req.body == null || typeof req.body !== "object") {
    return res
      .status(400)
      .json({ error: { message: "Request body must be JSON", type: "invalid_request_error" } });
  }

  const { model, messages, stream, tools } = req.body;
  if (!MODELS.includes(model)) {
    return res
      .status(400)
      .json({ error: { message: `Unknown model: ${model}. Available: ${MODELS.join(", ")}` } });
  }
  if (tools?.length) {
    logLine("NOTE: tools ignored — local opencode session can't run client-side tool loops");
  }

  const { system, history, text } = openAIToPrompt(messages);
  const inputTokens = (JSON.stringify(messages).length / 4) | 0;
  logLine(user, model, stream ? "stream" : "sync", "msgs:", JSON.stringify(msgSummary(messages)));
  logIO("INPUT", { model, stream: !!stream, messages });

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
      for (const chunk of openAIStreamChunks(model, info, parts, inputTokens)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      logIO("OUTPUT (stream)", parts.filter((p) => p.type === "text").map((p) => p.text).join(""));
      return;
    }

    const completion = toOpenAICompletion(model, info, parts, inputTokens);
    logIO("OUTPUT (sync)", completion);
    res.json(completion);
  } catch (e) {
    logLine("ERROR", e.message);
    logIO("OUTPUT (error)", { error: e.message });
    if (res.headersSent) return res.end();
    const status = e.status === 429 ? 429 : e.status >= 400 && e.status < 600 ? e.status : 502;
    res.status(status).json({
      error: { message: e.message, type: status === 429 ? "rate_limit_error" : "upstream_error" },
    });
  }
});

export default router;
