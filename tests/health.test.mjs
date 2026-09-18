import { describe, it } from "node:test";
import assert from "node:assert";
import { createApp } from "../src/app.mjs";

describe("GET /health", () => {
  it("reports endpoints and opencode reachability", async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.version);
      assert.ok(Array.isArray(body.endpoints));
      assert.ok(body.endpoints.includes("/v1/chat/completions"));
      assert.strictEqual(typeof body.opencode.up, "boolean");
      assert.strictEqual(body.status, body.opencode.up ? "ok" : "degraded");
    } finally {
      server.close();
    }
  });
});
