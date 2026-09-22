import { ocId } from "./utils.mjs";

// ── Input: Response API → OpenAI chat/completions ──────────────────────────

/** Flatten content block array into a plain string. Handles both `input_text` (user) and `output_text` (assistant) blocks. */
function inputText(blocks) {
  if (typeof blocks === "string") return blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "input_text" || b.type === "output_text")
    .map((b) => b.text || "")
    .join("");
}

/**
 * Convert a single Response API input item into one or more OpenAI messages.
 *   - {type:"message", role, content}  → user/assistant message
 *   - {type:"function_call_output", ...} → tool message
 *   - {type:"function_call", ...}       → assistant message with tool_calls
 */
function itemToMessages(item) {
  if (item.type === "function_call_output") {
    return [
      {
        role: "tool",
        tool_call_id: item.call_id,
        content: item.output || "",
      },
    ];
  }

  if (item.type === "function_call") {
    return [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: item.call_id,
            type: "function",
            function: {
              name: item.name,
              arguments: item.arguments,
            },
          },
        ],
      },
    ];
  }

  if (item.type === "message") {
    const role = item.role || "user";
    const text = inputText(item.content);
    return [{ role, content: text }];
  }

  return [];
}

/** Convert Response API `tool_choice` to OpenAI format. */
function mapToolChoice(tc) {
  if (!tc) return undefined;
  if (typeof tc === "string") return tc;
  if (tc.type === "auto") return "auto";
  if (tc.type === "none") return "none";
  if (tc.type === "required") return "required";
  if (tc.type === "function" && tc.name) {
    return { type: "function", function: { name: tc.name } };
  }
  return undefined;
}

/**
 * Convert a Response API request body into a Zen-compatible chat/completions
 * body (messages + tools + tool_choice + max_tokens).
 *
 * @returns {{ messages: Array, tools?: Array, tool_choice?: any, max_tokens?: number }}
 */
export function responseToOpenAI(body) {
  const messages = [];

  // System instruction
  if (body.instructions) {
    messages.push({ role: "system", content: body.instructions });
  }

  // Input → messages
  const input = body.input;
  if (typeof input === "string") {
    if (input) messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      messages.push(...itemToMessages(item));
    }
  }

  // Tools (already shape-compatible; restructure just in case)
  let tools;
  if (Array.isArray(body.tools) && body.tools.length) {
    tools = body.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: t.parameters || {},
      },
    }));
  }

  const result = { messages };
  if (tools) result.tools = tools;
  const tc = mapToolChoice(body.tool_choice);
  if (tc) result.tool_choice = tc;
  if (body.max_output_tokens) result.max_tokens = body.max_output_tokens;
  if (body.temperature != null) result.temperature = body.temperature;
  if (body.top_p != null) result.top_p = body.top_p;

  return result;
}

// ── Output: OpenAI chat/completions → Response API ─────────────────────────

/**
 * Map OpenAI finish_reason to Response API status.
 */
function finishToStatus(finishReason) {
  if (finishReason === "stop" || finishReason === "tool_calls") return "completed";
  if (finishReason === "length") return "incomplete";
  return "completed";
}

/**
 * Build a non-streaming Response API response from an OpenAI completion.
 */
export function openAIToResponse(oaiResp, model) {
  const choice = oaiResp.choices?.[0];
  const output = [];

  if (choice) {
    const msg = choice.message || {};

    // Text content → output_text item
    if (msg.content) {
      output.push({
        type: "message",
        id: ocId("msg"),
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: msg.content }],
      });
    }

    // Tool calls → function_call items
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        output.push({
          type: "function_call",
          id: ocId("msg"),
          call_id: tc.id || ocId("call"),
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "",
        });
      }
    }
  }

  const usage = oaiResp.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;

  return {
    id: ocId("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: choice ? finishToStatus(choice.finish_reason) : "completed",
    model: model || oaiResp.model || "",
    output,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
    incomplete_details: choice?.finish_reason === "length"
      ? { reason: "max_tokens" }
      : null,
  };
}

// ── Streaming state ────────────────────────────────────────────────────────

/**
 * Create mutable state for streaming Zen deltas → Response API events.
 *
 * @param {string} model
 * @returns {object} state
 */
export function streamingState(model) {
  return {
    respId: ocId("resp"),
    created_at: Math.floor(Date.now() / 1000),
    model,
    outputItems: [],   // accumulated output items (for final response)
    // text streaming
    curTextId: null,
    textDone: false,
    // function_call streaming — keyed by Zen tool_call index
    fcSeen: new Set(),
    fcDone: new Set(),
    // Zen tool_call index → outputItems array index
    // (differs from Zen index when a text item precedes the function_calls)
    fcOutputIndex: new Map(),
    // tracking
    status: "in_progress",
    finishReason: null,
    inputTokens: 0,
    outputTokens: 0,
    usageSeen: false,
  };
}

/**
 * Build the full response object from accumulated streaming state.
 */
export function buildFinalResponse(state) {
  return {
    id: state.respId,
    object: "response",
    created_at: state.created_at,
    status: state.status === "in_progress" ? "completed" : state.status,
    model: state.model,
    output: state.outputItems,
    usage: {
      input_tokens: state.inputTokens,
      output_tokens: state.outputTokens,
      total_tokens: state.inputTokens + state.outputTokens,
    },
    incomplete_details:
      state.finishReason === "length"
        ? { reason: "max_tokens" }
        : null,
  };
}

/**
 * Emit Response API SSE events from an OpenAI streaming delta.
 *
 * Handles:
 *   - Text content → output_text item
 *   - Tool calls → function_call item
 *   - finish_reason → status + response.completed
 *
 * @param {object} state  Mutable streaming state from streamingState()
 * @param {object} parsed A parsed OpenAI SSE delta payload
 * @param {(event: string, data: object) => void} emit  Event emitter
 */
export function processStreamDelta(state, parsed, emit) {
  // ── usage from final chunk (may arrive without choices) ──
  if (parsed.usage) {
    state.usageSeen = true;
    state.inputTokens = parsed.usage.prompt_tokens || state.inputTokens;
    state.outputTokens =
      parsed.usage.completion_tokens || state.outputTokens;
  }

  const choice = parsed.choices?.[0];
  if (!choice) return;
  const delta = choice.delta || {};

  // ── text content ──
  if (typeof delta.content === "string" && delta.content) {
    // Lazily open the text output item
    if (!state.curTextId) {
      state.curTextId = ocId("msg");
      const item = {
        type: "message",
        id: state.curTextId,
        role: "assistant",
        status: "in_progress",
        content: [{ type: "output_text", text: "" }],
      };
      state.outputItems.push(item);
      emit("response.output_item.added", {
        type: "response.output_item.added",
        output_index: state.outputItems.length - 1,
        item,
      });
      emit("response.content_part.added", {
        type: "response.content_part.added",
        output_index: state.outputItems.length - 1,
        content_index: 0,
        part: { type: "output_text", text: "" },
      });
    }

    state.outputItems[state.outputItems.length - 1].content[0].text +=
      delta.content;
    state.outputTokens += Math.ceil(delta.content.length / 4);
    emit("response.content_part.delta", {
      type: "response.content_part.delta",
      output_index: state.outputItems.length - 1,
      content_index: 0,
      delta: {
        type: "output_text.delta",
        text: delta.content,
      },
    });
  }

  // ── tool calls ──
  if (Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      const isNew = !state.fcSeen.has(idx);
      if (isNew) {
        state.fcSeen.add(idx);
        const item = {
          type: "function_call",
          id: ocId("msg"),
          call_id: tc.id || ocId("call"),
          name: tc.function?.name || "",
          arguments: "",
        };
        state.outputItems.push(item);
        // Track the real outputItems index for this Zen tool_call index
        state.fcOutputIndex.set(idx, state.outputItems.length - 1);

        emit("response.output_item.added", {
          type: "response.output_item.added",
          output_index: state.outputItems.length - 1,
          item,
        });
        emit("response.function_call_arguments.start", {
          type: "response.function_call_arguments.start",
          output_index: state.outputItems.length - 1,
        });
        // Initial delta right after start (empty when args arrive on later chunks)
        emit("response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          output_index: state.outputItems.length - 1,
          delta: {
            type: "function_call_arguments.delta",
            arguments: tc.function?.arguments || "",
          },
        });
        if (tc.function?.arguments) {
          const target = state.outputItems[state.outputItems.length - 1];
          if (target.type === "function_call")
            target.arguments += tc.function.arguments;
          state.outputTokens += Math.ceil(tc.function.arguments.length / 4);
        }
      }

      const outIdx = state.fcOutputIndex.get(idx) ?? state.outputItems.length - 1;

      // Update name if it arrives on a later chunk
      if (tc.function?.name && isNew) {
        const target = state.outputItems[outIdx];
        if (target.type === "function_call" && !target.name) {
          target.name = tc.function.name;
        }
      }

      if (tc.function?.arguments && !isNew) {
        const target = state.outputItems[outIdx];
        if (target.type === "function_call") {
          target.arguments += tc.function.arguments;
        }
        state.outputTokens += Math.ceil(tc.function.arguments.length / 4);
        emit("response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          output_index: outIdx,
          delta: {
            type: "function_call_arguments.delta",
            arguments: tc.function.arguments,
          },
        });
      }
    }
  }

  // ── finish reason → finalize all open items ──
  if (choice.finish_reason) {
    state.finishReason = choice.finish_reason;
    if (
      choice.finish_reason === "tool_calls" ||
      choice.finish_reason === "stop"
    ) {
      state.status = "completed";
    } else if (choice.finish_reason === "length") {
      state.status = "incomplete";
    } else {
      state.status = "completed";
    }

    // Close the open text item if any
    if (state.curTextId && !state.textDone) {
      state.textDone = true;
      const outIdx = state.outputItems.findIndex(
        (o) => o.id === state.curTextId,
      );
      const item = state.outputItems[outIdx];
      item.status = "completed";
      emit("response.content_part.done", {
        type: "response.content_part.done",
        output_index: outIdx,
        content_index: 0,
        part: item.content[0],
      });
      emit("response.output_item.done", {
        type: "response.output_item.done",
        output_index: outIdx,
        item,
      });
    }

    // Close any open function_call items using the tracked output index
    for (const zenIdx of state.fcSeen) {
      if (!state.fcDone.has(zenIdx)) {
        state.fcDone.add(zenIdx);
        const outIdx = state.fcOutputIndex.get(zenIdx);
        const item = state.outputItems[outIdx];
        emit("response.function_call_arguments.done", {
          type: "response.function_call_arguments.done",
          output_index: outIdx,
          arguments: item.arguments,
        });
        item.status = "completed";
        emit("response.output_item.done", {
          type: "response.output_item.done",
          output_index: outIdx,
          item,
        });
      }
    }

    // Final completed event
    emit("response.completed", {
      type: "response.completed",
      response: buildFinalResponse(state),
    });
  }
}
