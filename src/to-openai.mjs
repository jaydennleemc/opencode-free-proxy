/** Extract plain text from an Anthropic content field (string or content blocks). */
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text || "").join("\n");
  return "";
}

/** Convert an Anthropic /v1/messages body to OpenAI chat messages. */
export function anthropicToOpenAI(body) {
  const messages = [];

  if (body.system) {
    const sys = contentText(body.system);
    if (sys) messages.push({ role: "system", content: sys });
  }

  for (const msg of body.messages || []) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (!Array.isArray(msg.content)) continue;

    const blocks = msg.content;
    const toolResults = blocks.filter((b) => b.type === "tool_result");
    if (toolResults.length) {
      for (const b of toolResults) {
        messages.push({
          role: "tool",
          tool_call_id: b.tool_use_id,
          content: contentText(b.content),
        });
      }
      continue;
    }

    const text = contentText(blocks.filter((b) => b.type === "text"));
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length && msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolUses.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.input || {}) },
        })),
      });
      continue;
    }

    messages.push({ role: msg.role, content: text });
  }

  return { messages };
}
