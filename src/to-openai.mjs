/** Extract plain text from an Anthropic content field that may be a string or an array of content blocks. */
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(c => c.text || "").join("\n");
  return "";
}

/** Convert an Anthropic /v1/messages body into OpenAI /v1/chat/completions format. */
export function anthropicToOpenAI(body) {
  const messages = [];
  if (body.system) {
    const sys = contentText(body.system);
    if (sys) messages.push({ role: "system", content: sys });
  }
  for (const msg of body.messages || []) {
    if (typeof msg.content === "string") {
      messages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const text = contentText(msg.content.filter(b => b.type === "text"));

      const toolUses = msg.content.filter(b => b.type === "tool_use");
      if (toolUses.length && msg.role === "assistant") {
        messages.push({
          role: "assistant",
          content: text || null,
          tool_calls: toolUses.map(t => ({
            id: t.id,
            type: "function",
            function: { name: t.name, arguments: JSON.stringify(t.input || {}) },
          })),
        });
      } else if (msg.content.some(b => b.type === "tool_result")) {
        for (const b of msg.content.filter(b => b.type === "tool_result")) {
          messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: contentText(b.content) });
        }
      } else {
        messages.push({ role: msg.role, content: text });
      }
    }
  }

  const tools = (body.tools || []).map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || {},
    },
  }));

  return { messages, tools: tools.length ? tools : undefined };
}
