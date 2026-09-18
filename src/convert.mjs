/** Extract plain text from a message content field (string or content-block array). */
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text || "").join("\n");
  return "";
}

/**
 * Convert OpenAI chat messages to OpenCode serve terms:
 *   system  — first system message, passed via the prompt's `system` field
 *   history — all messages before the final user one (cached via noReply)
 *   text    — the final user message, sent as the actual prompt
 *
 * Tool calls and tool results are flattened to text: the local opencode
 * session can't represent client-side tool loops, so it only ever sees a
 * transcript. Returns null for `text` when there is no user message (invalid).
 */
export function openAIToPrompt(messages) {
  let system;
  const turns = [];

  for (const m of messages || []) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "system") {
      if (system === undefined) system = contentText(m.content);
      continue;
    }
    if (m.role === "user") {
      const t = contentText(m.content);
      if (t) turns.push({ role: "user", content: t });
      continue;
    }
    if (m.role === "assistant") {
      const parts = [];
      const t = contentText(m.content);
      if (t) parts.push(t);
      for (const tc of m.tool_calls || []) {
        parts.push(
          `[tool call] ${tc.function?.name}(${tc.function?.arguments || "{}"})`,
        );
      }
      if (parts.length) turns.push({ role: "assistant", content: parts.join("\n") });
      continue;
    }
    if (m.role === "tool") {
      turns.push({
        role: "user",
        content: `[tool result${m.tool_call_id ? " for " + m.tool_call_id : ""}]: ${contentText(m.content)}`,
      });
    }
  }

  const last = turns[turns.length - 1];
  const text = last?.role === "user" ? last.content : null;
  const history = text !== null ? turns.slice(0, -1) : turns;
  return { system, history, text };
}
