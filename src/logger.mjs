// Detailed I/O logging for the proxy.
// LOG_DETAIL=0 to disable full dumps; LOG_MAX_CHARS=N to truncate (0 = unlimited).

export const LOG_DETAIL = process.env.LOG_DETAIL !== "0";
export const LOG_MAX_CHARS = Number(process.env.LOG_MAX_CHARS || 0) || 0;

function trunc(str) {
  if (typeof str !== "string") str = String(str);
  if (!LOG_MAX_CHARS || str.length <= LOG_MAX_CHARS) return str;
  return str.slice(0, LOG_MAX_CHARS) + `\n... [truncated, total ${str.length} chars]`;
}

export function logLine(tag, ...args) {
  console.log(`[${tag}]`, new Date().toISOString(), ...args);
}

/** Pretty-print a labeled I/O block (request/response body). */
export function logIO(tag, label, payload) {
  if (!LOG_DETAIL) return;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  console.log(`[${tag}] ── ${label} ──\n${trunc(body)}\n[${tag}] ── end ${label} ──`);
}

export function msgSummary(messages) {
  return (messages || []).map((m) => {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
    const s = { role: m.role, len: content.length };
    if (m.tool_calls?.length) s.tool_calls = m.tool_calls.length;
    if (m.tool_call_id) s.tool_call_id = m.tool_call_id;
    return s;
  });
}

/** Reconstruct assistant text + tool_calls from OpenAI SSE stream bytes. */
export function parseOpenAIStreamOutput(raw) {
  let content = "";
  const toolCalls = {};
  let finishReason = null;
  let usage = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    let parsed;
    try { parsed = JSON.parse(payload); } catch { continue; }
    if (parsed.usage) usage = parsed.usage;
    const choice = parsed.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || choice.message;
    if (!delta) continue;
    if (delta.content) content += delta.content;
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        if (!toolCalls[i]) toolCalls[i] = { id: tc.id || "", name: "", arguments: "" };
        if (tc.id) toolCalls[i].id = tc.id;
        if (tc.function?.name) toolCalls[i].name = tc.function.name;
        if (tc.function?.arguments) toolCalls[i].arguments += tc.function.arguments;
      }
    }
  }
  const out = { content };
  const tcs = Object.values(toolCalls);
  if (tcs.length) out.tool_calls = tcs;
  if (finishReason) out.finish_reason = finishReason;
  if (usage) out.usage = usage;
  return out;
}

export function parseOpenAISyncOutput(data) {
  if (!data) return { raw: null };
  const choice = data.choices?.[0];
  const out = {
    content: choice?.message?.content ?? null,
    finish_reason: choice?.finish_reason ?? null,
    usage: data.usage ?? null,
  };
  if (choice?.message?.tool_calls?.length) {
    out.tool_calls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: tc.function?.arguments,
    }));
  }
  return out;
}

export function logStatusLine() {
  console.log(
    "  Log detail:",
    LOG_DETAIL ? "on" : "off",
    LOG_MAX_CHARS ? `(max ${LOG_MAX_CHARS} chars)` : "(unlimited)",
  );
}
