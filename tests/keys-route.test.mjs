import { describe, it, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keys-route-test-"));
process.env.KEYS_FILE = path.join(tmpDir, "api-keys.json");

const { createApp } = await import("../src/app.mjs");
const { loadKeys, apiKeys } = await import("../src/auth.mjs");

loadKeys();
const ADMIN = apiKeys.admin;
const USER = apiKeys["user-default"];

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

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

const call = (port, method, name = "", key = ADMIN, body) =>
  fetch(`http://127.0.0.1:${port}/v1/keys${name}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

describe("/v1/keys", () => {
  it("requires auth", async () => {
    await withServer(async (port) => {
      const res = await call(port, "GET", "", "wrong");
      assert.strictEqual(res.status, 401);
    });
  });

  it("rejects non-admin keys with 403", async () => {
    await withServer(async (port) => {
      const res = await call(port, "GET", "", USER);
      assert.strictEqual(res.status, 403);
    });
  });

  it("creates, lists, and deletes a key", async () => {
    await withServer(async (port) => {
      const created = await call(port, "POST", "", ADMIN, { name: "laptop" });
      assert.strictEqual(created.status, 201);
      const { key } = await created.json();
      assert.ok(key.startsWith("oc-"));

      const list = await call(port, "GET");
      const { data } = await list.json();
      assert.ok(data.some((k) => k.name === "laptop" && k.key === key));

      // the new key actually authenticates
      const me = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      assert.strictEqual(me.status, 200);

      // duplicate name rejected
      const dup = await call(port, "POST", "", ADMIN, { name: "laptop" });
      assert.strictEqual(dup.status, 409);

      const del = await call(port, "DELETE", "/laptop");
      assert.strictEqual(del.status, 200);
      assert.ok(!apiKeys.laptop);
    });
  });

  it("rejects invalid names and protects the admin key", async () => {
    await withServer(async (port) => {
      const bad = await call(port, "POST", "", ADMIN, { name: "bad name!" });
      assert.strictEqual(bad.status, 409);

      const delAdmin = await call(port, "DELETE", "/admin");
      assert.strictEqual(delAdmin.status, 400);
    });
  });

  it("persists created keys to the keys file", async () => {
    await withServer(async (port) => {
      await call(port, "POST", "", ADMIN, { name: "persisted" });
      const onDisk = JSON.parse(fs.readFileSync(process.env.KEYS_FILE, "utf8"));
      assert.ok(onDisk.persisted?.startsWith("oc-"));
      await call(port, "DELETE", "/persisted");
    });
  });
});
