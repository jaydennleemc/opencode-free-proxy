import { describe, it } from "node:test";
import assert from "node:assert";
import {
  responseToOpenAI,
  openAIToResponse,
  streamingState,
  buildFinalResponse,
  processStreamDelta,
} from "../src/to-response.mjs";

// ── responseToOpenAI (input conversion) ────────────────────────────────────

describe("responseToOpenAI", () => {
  it("converts a string input to a user message", () => {
    const result = responseToOpenAI({ model: "m", input: "Hello" });
    assert.deepStrictEqual(result.messages, [{ role: "user", content: "Hello" }]);
  });

  it("converts instructions to a system message", () => {
    const result = responseToOpenAI({
      model: "m",
      instructions: "Be concise",
      input: "Hi",
    });
    assert.deepStrictEqual(result.messages, [
      { role: "system", content: "Be concise" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("converts an array of message items", () => {
    const result = responseToOpenAI({
      model: "m",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] },
        { type: "message", role: "assistant", content: [{ type: "input_text", text: "Hello" }] },
        { type: "message", role: "user", content: [{ type: "input_text", text: "Bye" }] },
      ],
    });
    assert.deepStrictEqual(result.messages, [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Bye" },
    ]);
  });

  it("converts function_call_output to a tool message", () => {
    const result = responseToOpenAI({
      model: "m",
      input: [
        { type: "function_call_output", call_id: "call_123", output: "result here" },
      ],
    });
    assert.deepStrictEqual(result.messages, [
      { role: "tool", tool_call_id: "call_123", content: "result here" },
    ]);
  });

  it("converts function_call to an assistant message with tool_calls", () => {
    const result = responseToOpenAI({
      model: "m",
      input: [
        {
          type: "function_call",
          call_id: "call_abc",
          name: "grep",
          arguments: '{"pattern":"foo"}',
        },
      ],
    });
    assert.deepStrictEqual(result.messages, [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function",
            function: { name: "grep", arguments: '{"pattern":"foo"}' },
          },
        ],
      },
    ]);
  });

  it("converts tools to OpenAI format", () => {
    const result = responseToOpenAI({
      model: "m",
      input: "test",
      tools: [
        { type: "function", name: "bash", description: "Run shell", parameters: { type: "object" } },
      ],
    });
    assert.deepStrictEqual(result.tools, [
      { type: "function", function: { name: "bash", description: "Run shell", parameters: { type: "object" } } },
    ]);
  });

  it("converts tool_choice auto", () => {
    const result = responseToOpenAI({
      model: "m",
      input: "test",
      tool_choice: { type: "auto" },
    });
    assert.strictEqual(result.tool_choice, "auto");
  });

  it("converts tool_choice function", () => {
    const result = responseToOpenAI({
      model: "m",
      input: "test",
      tool_choice: { type: "function", name: "grep" },
    });
    assert.deepStrictEqual(result.tool_choice, { type: "function", function: { name: "grep" } });
  });

  it("passes max_output_tokens as max_tokens", () => {
    const result = responseToOpenAI({ model: "m", input: "x", max_output_tokens: 1024 });
    assert.strictEqual(result.max_tokens, 1024);
  });

  it("passes temperature and top_p", () => {
    const result = responseToOpenAI({ model: "m", input: "x", temperature: 0.5, top_p: 0.9 });
    assert.strictEqual(result.temperature, 0.5);
    assert.strictEqual(result.top_p, 0.9);
  });

  it("handles empty string input", () => {
    const result = responseToOpenAI({ model: "m", input: "" });
    assert.deepStrictEqual(result.messages, []);
  });

  it("handles missing input", () => {
    const result = responseToOpenAI({ model: "m" });
    assert.deepStrictEqual(result.messages, []);
  });
});

// ── openAIToResponse (output conversion) ───────────────────────────────────

describe("openAIToResponse", () => {
  it("converts a text response", () => {
    const oaiResp = {
      id: "chatcmpl_test",
      model: "mimo-v2.5-free",
      choices: [{
        message: { role: "assistant", content: "Hello!" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    const resp = openAIToResponse(oaiResp, "mimo-v2.5-free");
    assert.strictEqual(resp.object, "response");
    assert.strictEqual(resp.status, "completed");
    assert.strictEqual(resp.model, "mimo-v2.5-free");
    assert.strictEqual(resp.output.length, 1);
    assert.strictEqual(resp.output[0].type, "message");
    assert.strictEqual(resp.output[0].content[0].type, "output_text");
    assert.strictEqual(resp.output[0].content[0].text, "Hello!");
    assert.strictEqual(resp.usage.input_tokens, 10);
    assert.strictEqual(resp.usage.output_tokens, 5);
    assert.strictEqual(resp.usage.total_tokens, 15);
  });

  it("converts tool_calls to function_call output items", () => {
    const oaiResp = {
      id: "chatcmpl_test",
      model: "m",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_abc", type: "function", function: { name: "grep", arguments: '{"p":"x"}' } },
          ],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    };
    const resp = openAIToResponse(oaiResp, "m");
    assert.strictEqual(resp.status, "completed");
    assert.strictEqual(resp.output.length, 1);
    assert.strictEqual(resp.output[0].type, "function_call");
    assert.strictEqual(resp.output[0].call_id, "call_abc");
    assert.strictEqual(resp.output[0].name, "grep");
    assert.strictEqual(resp.output[0].arguments, '{"p":"x"}');
  });

  it("converts length finish_reason to incomplete", () => {
    const oaiResp = {
      id: "chatcmpl_test",
      model: "m",
      choices: [{ message: { content: "truncated" }, finish_reason: "length" }],
      usage: {},
    };
    const resp = openAIToResponse(oaiResp, "m");
    assert.strictEqual(resp.status, "incomplete");
    assert.deepStrictEqual(resp.incomplete_details, { reason: "max_tokens" });
  });

  it("handles empty choices", () => {
    const resp = openAIToResponse({ choices: [], model: "m" }, "m");
    assert.strictEqual(resp.status, "completed");
    assert.deepStrictEqual(resp.output, []);
  });

  it("id starts with resp_", () => {
    const resp = openAIToResponse({ choices: [{ message: { content: "x" }, finish_reason: "stop" }] }, "m");
    assert.match(resp.id, /^resp_/);
  });
});

// ── streaming helpers ──────────────────────────────────────────────────────

describe("streamingState + processStreamDelta", () => {
  it("emits text streaming events in correct order", () => {
    const state = streamingState("m");
    const events = [];
    const emit = (event, data) => events.push({ event, data });

    // First text chunk — should open item + content_part + delta
    processStreamDelta(state, {
      choices: [{ delta: { content: "Hello" }, finish_reason: null }],
    }, emit);

    assert.deepStrictEqual(
      events.map((e) => e.event),
      [
        "response.output_item.added",
        "response.content_part.added",
        "response.content_part.delta",
      ],
    );
    assert.strictEqual(events[2].data.delta.text, "Hello");

    events.length = 0;

    // Second text chunk — just delta
    processStreamDelta(state, {
      choices: [{ delta: { content: " world" }, finish_reason: null }],
    }, emit);

    assert.deepStrictEqual(events.map((e) => e.event), [
      "response.content_part.delta",
    ]);

    events.length = 0;

    // Finish — should close content_part, close item, emit completed
    processStreamDelta(state, {
      choices: [{ delta: {}, finish_reason: "stop" }],
    }, emit);

    assert.deepStrictEqual(
      events.map((e) => e.event),
      [
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
      ],
    );
    assert.strictEqual(events[2].data.response.status, "completed");
  });

  it("emits function_call streaming events", () => {
    const state = streamingState("m");
    const events = [];
    const emit = (event, data) => events.push({ event, data });

    // First tool call chunk — new call → output_item.added + arguments.start + arguments.delta
    processStreamDelta(state, {
      choices: [{
        delta: { tool_calls: [{ index: 0, id: "call_abc", function: { name: "grep" } }] },
        finish_reason: null,
      }],
    }, emit);

    assert.deepStrictEqual(
      events.map((e) => e.event),
      [
        "response.output_item.added",
        "response.function_call_arguments.start",
        "response.function_call_arguments.delta",
      ],
    );
    assert.strictEqual(events[0].data.item.type, "function_call");
    assert.strictEqual(events[0].data.item.call_id, "call_abc");
    assert.strictEqual(events[0].data.item.name, "grep");

    events.length = 0;

    // Argument delta
    processStreamDelta(state, {
      choices: [{
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"p' } }] },
        finish_reason: null,
      }],
    }, emit);

    assert.deepStrictEqual(events.map((e) => e.event), [
      "response.function_call_arguments.delta",
    ]);
    assert.strictEqual(events[0].data.delta.arguments, '{"p');

    events.length = 0;

    // Finish — closes function_call + completed
    processStreamDelta(state, {
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    }, emit);

    assert.deepStrictEqual(
      events.map((e) => e.event),
      [
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.completed",
      ],
    );
    assert.strictEqual(events[2].data.response.status, "completed");
  });

  it("buildFinalResponse returns correct structure", () => {
    const state = streamingState("m");
    state.outputItems.push({
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "Hi" }],
    });
    state.inputTokens = 10;
    state.outputTokens = 5;
    const resp = buildFinalResponse(state);
    assert.strictEqual(resp.object, "response");
    assert.strictEqual(resp.status, "completed");
    assert.strictEqual(resp.usage.input_tokens, 10);
    assert.strictEqual(resp.usage.output_tokens, 5);
    assert.strictEqual(resp.usage.total_tokens, 15);
  });
});
