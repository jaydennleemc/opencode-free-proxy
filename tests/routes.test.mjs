import { describe, it, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";

const tmpKeys = path.join(os.tmpdir(), `opencode-routes-keys-${Date.now()}.json`);
process.env.KEYS_FILE = tmpKeys;

const { createApp } = await import("../src/app.mjs");
const { MODELS } = await import("../src/config/index.mjs");
const { loadKeys, apiKeys } = await import("../src/auth.mjs");

loadKeys();

after(() => {
  try { fs.unlinkSync(tmpKeys); } catch {}
});

async function withServer(fn) {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

describe("route auth", () => {
  it("returns 401 without a key on /v1/chat/completions", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELS[0], messages: [{ role: "user", content: "hi" }] }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  it("returns 401 without a key on /v1/messages", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELS[0], messages: [{ role: "user", content: "hi" }] }),
      });
      assert.strictEqual(res.status, 401);
    });
  });
});

describe("express 5 body handling", () => {
  it("returns 400 when chat body is missing (req.body undefined)", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKeys.admin}` },
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.match(body.error?.message || "", /JSON/i);
    });
  });

  it("returns 400 when messages body is missing", async () => {
    await withServer(async (port) => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": apiKeys.admin },
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.match(body.error?.message || "", /JSON/i);
    });
  });
});
