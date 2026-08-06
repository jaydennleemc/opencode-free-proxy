import { Router } from "express";
import { MODELS } from "../config/index.mjs";
import { auth } from "../auth.mjs";
import { getSession } from "../session.mjs";
import { zenRequest } from "../client.mjs";
import { pipeZenResponse } from "../pipe-openai.mjs";
import { ensureAssistantReasoning } from "../reasoning.mjs";
import { logLine, logIO, msgSummary } from "../logger.mjs";

const router = Router();

router.post("/v1/chat/completions", (req, res) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ error: { message: "Invalid API key" } });

  // Express 5: unparsed body is `undefined` (was `{}` in v4)
  if (req.body == null || typeof req.body !== "object") {
    return res.status(400).json({ error: { message: "Request body must be JSON", type: "invalid_request_error" } });
  }

  const { model, messages, stream, tools, tool_choice } = req.body;
  if (!MODELS.includes(model)) {
    return res.status(400).json({ error: { message: `Unknown model: ${model}. Available: ${MODELS.join(", ")}` } });
  }

  const sessionId = getSession(user);
  // Thinking-mode models require reasoning_content on assistant history messages.
  ensureAssistantReasoning(messages);
  logLine(user, model, stream ? "stream" : "sync", "msgs:", JSON.stringify(msgSummary(messages)));
  logIO("INPUT", {
    model,
    stream: !!stream,
    tool_choice: tool_choice || undefined,
    tools: tools?.length ? tools : undefined,
    messages,
  });

  const { body, options } = zenRequest(model, messages, stream, tools, tool_choice, sessionId);
  pipeZenResponse(options, body, stream, res, { user, clientReq: req });
});

export default router;
