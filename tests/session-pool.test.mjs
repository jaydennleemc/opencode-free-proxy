import { describe, it } from "node:test";
import assert from "node:assert";
import { SessionPool } from "../src/session-pool.mjs";

// SessionPool spawns real opencode sessions — stub the network layer by
// monkey-patching the module's imports is not possible with ESM, so we test
// the concurrency logic via a subclass-friendly seam: override create/delete.
// Simpler: exercise the pool with `OC_BASE_URL` unreachable and rely on
// acquire() queueing while fill() keeps failing.

describe("SessionPool", () => {
  it("queues acquires when empty and hands out sessions in order", async () => {
    const pool = new SessionPool();
    // patch internals — no network
    pool.sessions.push({ id: "s1", ts: Date.now(), busy: false });
    pool.sessions.push({ id: "s2", ts: Date.now(), busy: false });

    const a = await pool.acquire();
    assert.strictEqual(a.id, "s1");
    const b = await pool.acquire();
    assert.strictEqual(b.id, "s2");
    assert.strictEqual(a.busy, true);

    let third;
    const pending = pool.acquire().then((s) => (third = s));
    pool.release(a);
    await pending;
    assert.strictEqual(third.id, "s1");
  });

  it("release wakes the oldest waiter first", async () => {
    const pool = new SessionPool();
    pool.sessions.push({ id: "only", ts: Date.now(), busy: false });
    const first = await pool.acquire();

    const order = [];
    const w1 = pool.acquire().then((s) => order.push("w1"));
    const w2 = pool.acquire().then((s) => order.push("w2"));
    pool.release(first);
    await Promise.all([w1]);
    pool.release(first);
    await Promise.all([w2]);
    assert.deepStrictEqual(order, ["w1", "w2"]);
  });
});
