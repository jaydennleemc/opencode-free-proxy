import { Router } from "express";
import { auth } from "../auth.mjs";
import { getSession } from "../session.mjs";
import { zenRequest } from "../client.mjs";
import { responseToOpenAI } from "../to-response.mjs";
import { pipeZenAsResponse } from "../pipe-response.mjs";
import { ensureAssistantReasoning } from "../reasoning.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

/**
 * POST /v1/responses  (OpenAI Response API)
 *
 * Converts the Response API input into Zen's chat/completions format,
 * relays the request, and pipes the result back in Response API shape.
 */
router.post(["/v1/responses", "/responses"], (req, res) => {
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
      error: {
        type: "invalid_request_error",
        message: "Request body must be JSON",
      },
    });
  }

  const { model, stream } = req.body;
  if (typeof model !== "string" || !model.trim()) {
    return res.status(400).json({
      type: "error",
      error: { type: "invalid_request_error", message: "model is required" },
    });
  }

  const sessionId = getSession(user);
  const { messages, tools, tool_choice, max_tokens, temperature, top_p } =
    responseToOpenAI(req.body);

  // Thinking-mode models require reasoning_content on assistant history messages.
  ensureAssistantReasoning(messages);

  const inputTokens = (JSON.stringify(messages).length / 4) | 0;

  logLine(user, model, stream ? "stream" : "sync", "response_api",
    "msgs:", JSON.stringify(msgSummary(messages)));
  logIO("INPUT", {
    model,
    stream: !!stream,
    instructions: req.body.instructions || undefined,
    tools: req.body.tools?.length ? req.body.tools : undefined,
    tool_choice: req.body.tool_choice || undefined,
    _converted: { messages, tools: tools?.length ? tools : undefined, tool_choice, max_tokens },
  });

  const { body: zenBody, options } = zenRequest(
    model,
    messages,
    stream,
    tools,
    tool_choice,
    sessionId,
  );

  // zenRequest hardcodes stream:true and doesn't accept max_tokens /
  // temperature / top_p. Re-parse and inject any extra params.
  let finalBody = zenBody;
  const needsPatch = max_tokens || temperature != null || top_p != null;
  if (needsPatch) {
    try {
      const parsed = JSON.parse(zenBody);
      if (max_tokens) parsed.max_tokens = max_tokens;
      if (temperature != null) parsed.temperature = temperature;
      if (top_p != null) parsed.top_p = top_p;
      finalBody = JSON.stringify(parsed);
    } catch {}
  }

  pipeZenAsResponse(options, finalBody, model, stream, res, inputTokens, {
    user,
    clientReq: req,
  });
});

export default router;
