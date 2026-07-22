import { describe, it } from "node:test";
import assert from "node:assert";
import { createApp } from "../src/app.mjs";
import { MODELS } from "../src/config/index.mjs";

describe("route auth", () => {
  it("returns 401 without a key on /v1/chat/completions", async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELS[0], messages: [{ role: "user", content: "hi" }] }),
      });
      assert.strictEqual(res.status, 401);
    } finally {
      server.close();
    }
  });

  it("returns 401 without a key on /v1/messages", async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELS[0], messages: [{ role: "user", content: "hi" }] }),
      });
      assert.strictEqual(res.status, 401);
    } finally {
      server.close();
    }
  });
});
