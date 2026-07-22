import { Router } from "express";
import { MODELS } from "../config/index.mjs";
import { auth } from "../auth.mjs";
import { getSession } from "../session.mjs";
import { zenRequest, zenRequestFull } from "../zen.mjs";
import { pipeZenAsAnthropic } from "../pipes.mjs";
import { anthropicToOpenAI, openAIToAnthropic } from "../converters.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

router.post("/v1/messages", async (req, res) => {
  const user = auth(req);
  if (!user) {
    return res.status(401).json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } });
  }

  const { model, stream } = req.body;
  if (!MODELS.includes(model)) {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: `Unknown model: ${model}. Available: ${MODELS.join(", ")}` },
    });
  }

  const sessionId = getSession(user);
  const { messages, tools } = anthropicToOpenAI(req.body);
  const inputTokens = JSON.stringify(messages).length / 4 | 0;

  logLine("ANT", user, model, stream ? "stream" : "sync", "msgs:", JSON.stringify(msgSummary(messages)));
  logIO("ANT", "INPUT", {
    model,
    stream: !!stream,
    system: req.body.system,
    tools: req.body.tools?.length ? req.body.tools : undefined,
    messages: req.body.messages,
    _converted: { messages, tools: tools?.length ? tools : undefined },
  });

  const { body, options } = zenRequest(model, messages, stream, tools, undefined, sessionId);

  if (stream) {
    pipeZenAsAnthropic(options, body, model, res, inputTokens);
  } else {
    try {
      const t0 = Date.now();
      const zenResp = await zenRequestFull(options, body);
      const ms = Date.now() - t0;
      if (zenResp.status === 429 || zenResp.data?.error) {
        const errMsg = zenResp.data?.error?.message || "Rate limit exceeded";
        logIO("ANT", `OUTPUT (rate_limit, ${ms}ms)`, { error: errMsg });
        return res.status(429).json({
          type: "error", error: { type: "rate_limit_error", message: errMsg + " (free model rate limit)" },
        });
      }
      if (!zenResp.data?.choices) {
        logIO("ANT", `OUTPUT (invalid, ${ms}ms)`, { raw: zenResp.raw });
        return res.status(502).json({
          type: "error", error: { type: "upstream_error", message: "Invalid upstream response" },
        });
      }
      const antResp = openAIToAnthropic(zenResp.data, model, inputTokens);
      logIO("ANT", `OUTPUT (sync, ${ms}ms)`, antResp);
      res.json(antResp);
    } catch (e) {
      logLine("ZEN", "ERROR", e.message);
      logIO("ANT", "OUTPUT (error)", { error: e.message });
      res.status(502).json({ type: "error", error: { type: "upstream_error", message: e.message } });
    }
  }
});

export default router;
