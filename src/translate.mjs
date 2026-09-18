import { ocId } from "./utils.mjs";

const NO_CACHE = { cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Collect text from opencode reply parts; reasoning optionally joined separately. */
export function partsContent(parts) {
  let text = "";
  let reasoning = "";
  for (const p of parts || []) {
    if (p.type === "text") text += p.text || "";
    else if (p.type === "reasoning") reasoning += (reasoning ? "\n" : "") + (p.text || "");
  }
  return { text, reasoning };
}

function tokensToUsage(tokens, fallbackInput = 0) {
  const input = tokens?.input ?? fallbackInput;
  const output = tokens?.output ?? 0;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

/** opencode { info, parts } → OpenAI chat.completion */
export function toOpenAICompletion(model, info, parts, fallbackInput) {
  const { text, reasoning } = partsContent(parts);
  const message = { role: "assistant", content: text || "" };
  if (reasoning) message.reasoning_content = reasoning;
  return {
    id: ocId("chatcmpl"),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: info?.finish === "length" ? "length" : "stop",
      },
    ],
    usage: tokensToUsage(info?.tokens, fallbackInput),
  };
}

/** opencode { info, parts } → Anthropic /v1/messages response */
export function toAnthropicMessage(model, info, parts, fallbackInput) {
  const { text } = partsContent(parts);
  const content = [{ type: "text", text: text || "" }];
  return {
    id: ocId("msg"),
    type: "message",
    role: "assistant",
    content,
    model,
    stop_reason: info?.finish === "length" ? "max_tokens" : "end_turn",
    usage: {
      input_tokens: info?.tokens?.input ?? fallbackInput ?? 0,
      output_tokens: info?.tokens?.output ?? 0,
      ...NO_CACHE,
    },
  };
}

/**
 * Assemble OpenAI SSE chunks for a full (non-incremental) reply.
 * Emits role → optional reasoning → text chunks → final finish chunk.
 */
export function* openAIStreamChunks(model, info, parts, fallbackInput) {
  const id = ocId("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const base = { id, object: "chat.completion.chunk", created, model };
  const mk = (delta, finish = null) => ({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] });

  yield mk({ role: "assistant" });
  const { text, reasoning } = partsContent(parts);
  if (reasoning) yield mk({ reasoning_content: reasoning });
  const CHUNK = 400;
  for (let i = 0; i < text.length; i += CHUNK) {
    yield mk({ content: text.slice(i, i + CHUNK) });
  }
  const usage = tokensToUsage(info?.tokens, fallbackInput);
  yield { ...mk({}, info?.finish === "length" ? "length" : "stop"), usage };
}

/**
 * Assemble Anthropic SSE events for a full reply.
 * message_start → content_block_start → deltas → content_block_stop → message_delta → message_stop
 */
export function* anthropicStreamEvents(model, info, parts, inputTokens) {
  const msgId = ocId("msg");
  yield [
    "message_start",
    {
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        usage: { input_tokens: inputTokens || 0, output_tokens: 0, ...NO_CACHE },
      },
    },
  ];
  const { text } = partsContent(parts);
  yield [
    "content_block_start",
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ];
  const CHUNK = 400;
  for (let i = 0; i < text.length; i += CHUNK) {
    yield [
      "content_block_delta",
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: text.slice(i, i + CHUNK) },
      },
    ];
  }
  yield ["content_block_stop", { type: "content_block_stop", index: 0 }];
  yield [
    "message_delta",
    {
      type: "message_delta",
      delta: { stop_reason: info?.finish === "length" ? "max_tokens" : "end_turn" },
      usage: { output_tokens: info?.tokens?.output ?? 0 },
    },
  ];
  yield ["message_stop", { type: "message_stop" }];
}
