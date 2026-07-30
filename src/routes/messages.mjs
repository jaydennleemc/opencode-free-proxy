import { Router } from "express";
import { MODELS } from "../config/index.mjs";
import { auth } from "../auth.mjs";
import { getSession } from "../session.mjs";
import { zenRequest, zenRequestFull } from "../client.mjs";
import { pipeZenAsAnthropic } from "../pipe-anthropic.mjs";
import { anthropicToOpenAI } from "../to-openai.mjs";
import { openAIToAnthropic } from "../to-anthropic.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

router.post("/v1/messages", async (req, res, next) => {
  try {
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

    logLine(user, model, stream ? "stream" : "sync", "msgs:", JSON.stringify(msgSummary(messages)));
    logIO("INPUT", {
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
        // Retry up to 3 times with exponential backoff on rate-limit
        let zenResp;
        for (let attempt = 0; attempt <= 3; attempt++) {
          zenResp = await zenRequestFull(options, body);
          if (zenResp.status !== 429 && !zenResp.data?.error) break;
          if (attempt < 3) {
            const errMsg = zenResp.data?.error?.message || "Rate limit exceeded";
            logLine(`RATE LIMITED, retrying (${3 - attempt} left)`, errMsg);
            const delay = 1000 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
          }
        }
        const ms = Date.now() - t0;
        if (zenResp.status === 429 || zenResp.data?.error) {
          const errMsg = zenResp.data?.error?.message || "Rate limit exceeded";
          logIO(`OUTPUT (rate_limit, ${ms}ms)`, { error: errMsg });
          return res.status(429).json({
            type: "error", error: { type: "rate_limit_error", message: errMsg + " (free model rate limit)" },
          });
        }
        if (!zenResp.data?.choices) {
          logIO(`OUTPUT (invalid, ${ms}ms)`, { raw: zenResp.raw });
          return res.status(502).json({
            type: "error", error: { type: "upstream_error", message: "Invalid upstream response" },
          });
        }
        const antResp = openAIToAnthropic(zenResp.data, model, inputTokens);
        logIO(`OUTPUT (sync, ${ms}ms)`, antResp);
        res.json(antResp);
      } catch (e) {
        logLine("ZEN", "ERROR", e.message);
        logIO("OUTPUT (error)", { error: e.message });
        res.status(502).json({ type: "error", error: { type: "upstream_error", message: e.message } });
      }
    }
  } catch (e) {
    next(e);
  }
});

export default router;
