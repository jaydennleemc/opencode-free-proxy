import { describe, it } from "node:test";
import assert from "node:assert";
import { openAIToPrompt } from "../src/convert.mjs";
import { anthropicToOpenAI } from "../src/to-openai.mjs";

describe("openAIToPrompt", () => {
  it("extracts system, history, and final user text", () => {
    const { system, history, text } = openAIToPrompt([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "2+2?" },
    ]);
    assert.strictEqual(system, "be brief");
    assert.strictEqual(text, "2+2?");
    assert.deepStrictEqual(history, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("flattens assistant tool_calls to text", () => {
    const { history } = openAIToPrompt([
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: "checking",
        tool_calls: [{ function: { name: "grep", arguments: '{"q":"x"}' } }],
      },
      { role: "tool", tool_call_id: "t1", content: "result body" },
      { role: "user", content: "b" },
    ]);
    assert.deepStrictEqual(history, [
      { role: "user", content: "a" },
      { role: "assistant", content: 'checking\n[tool call] grep({"q":"x"})' },
      { role: "user", content: "[tool result for t1]: result body" },
    ]);
  });

  it("returns null text when there is no user message", () => {
    assert.strictEqual(openAIToPrompt([{ role: "system", content: "x" }]).text, null);
    assert.strictEqual(openAIToPrompt([]).text, null);
  });
});

describe("anthropicToOpenAI", () => {
  it("maps system + plain messages", () => {
    const { messages } = anthropicToOpenAI({
      system: "be nice",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    });
    assert.deepStrictEqual(messages, [
      { role: "system", content: "be nice" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("maps tool_use blocks to OpenAI tool_calls and tool_result to tool messages", () => {
    const { messages } = anthropicToOpenAI({
      messages: [
        { role: "user", content: "search" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "checking" },
            { type: "tool_use", id: "toolu_1", name: "grep", input: { q: "x" } },
          ],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "found" }],
        },
      ],
    });
    assert.deepStrictEqual(messages, [
      { role: "user", content: "search" },
      {
        role: "assistant",
        content: "checking",
        tool_calls: [{ id: "toolu_1", type: "function", function: { name: "grep", arguments: '{"q":"x"}' } }],
      },
      { role: "tool", tool_call_id: "toolu_1", content: "found" },
    ]);
  });
});
