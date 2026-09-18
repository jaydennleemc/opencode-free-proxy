import { describe, it } from "node:test";
import assert from "node:assert";
import {
  partsContent,
  toOpenAICompletion,
  toAnthropicMessage,
  openAIStreamChunks,
  anthropicStreamEvents,
} from "../src/translate.mjs";

const PARTS = [
  { type: "step-start", id: "p1" },
  { type: "reasoning", text: "thinking about it" },
  { type: "text", text: "Hello " },
  { type: "text", text: "world" },
  { type: "step-finish", tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 0, write: 0 } } },
];
const INFO = { finish: "stop", tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 0, write: 0 } } };

describe("partsContent", () => {
  it("joins text parts and collects reasoning separately", () => {
    const { text, reasoning } = partsContent(PARTS);
    assert.strictEqual(text, "Hello world");
    assert.strictEqual(reasoning, "thinking about it");
  });
});

describe("toOpenAICompletion", () => {
  it("maps info/parts to a chat.completion", () => {
    const c = toOpenAICompletion("m", INFO, PARTS);
    assert.strictEqual(c.object, "chat.completion");
    assert.match(c.id, /^chatcmpl_/);
    assert.strictEqual(c.model, "m");
    assert.strictEqual(c.choices[0].message.content, "Hello world");
    assert.strictEqual(c.choices[0].message.reasoning_content, "thinking about it");
    assert.strictEqual(c.choices[0].finish_reason, "stop");
    assert.deepStrictEqual(c.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });
});

describe("toAnthropicMessage", () => {
  it("maps info/parts to a message response", () => {
    const m = toAnthropicMessage("m", INFO, PARTS);
    assert.strictEqual(m.type, "message");
    assert.match(m.id, /^msg_/);
    assert.deepStrictEqual(m.content, [{ type: "text", text: "Hello world" }]);
    assert.strictEqual(m.stop_reason, "end_turn");
    assert.strictEqual(m.usage.input_tokens, 10);
    assert.strictEqual(m.usage.output_tokens, 5);
  });

  it("maps finish=length to max_tokens", () => {
    assert.strictEqual(toAnthropicMessage("m", { ...INFO, finish: "length" }, PARTS).stop_reason, "max_tokens");
  });
});

describe("openAIStreamChunks", () => {
  it("emits role, reasoning, text chunks, and final with usage", () => {
    const chunks = [...openAIStreamChunks("m", INFO, PARTS)];
    assert.strictEqual(chunks[0].choices[0].delta.role, "assistant");
    assert.strictEqual(chunks[1].choices[0].delta.reasoning_content, "thinking about it");
    const text = chunks.slice(2, -1).map((c) => c.choices[0].delta.content).join("");
    assert.strictEqual(text, "Hello world");
    const last = chunks[chunks.length - 1];
    assert.strictEqual(last.choices[0].finish_reason, "stop");
    assert.strictEqual(last.usage.total_tokens, 15);
  });
});

describe("anthropicStreamEvents", () => {
  it("emits a valid SSE event sequence", () => {
    const events = [...anthropicStreamEvents("m", INFO, PARTS, 10)];
    assert.strictEqual(events[0][0], "message_start");
    assert.strictEqual(events[1][0], "content_block_start");
    const deltas = events.filter(([e]) => e === "content_block_delta").map(([, d]) => d.delta.text).join("");
    assert.strictEqual(deltas, "Hello world");
    assert.deepStrictEqual(
      events.map(([e]) => e).slice(-3),
      ["content_block_stop", "message_delta", "message_stop"],
    );
  });
});
