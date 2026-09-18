import { describe, it } from "node:test";
import assert from "node:assert";
import { rateLimitRetryDelay } from "../src/retry.mjs";

describe("rateLimitRetryDelay", () => {
  it("stays near exponential base with ±20% jitter", () => {
    for (let i = 0; i < 20; i++) {
      const d0 = rateLimitRetryDelay(0, 1000, 60_000);
      assert.ok(d0 >= 800 && d0 <= 1200, `attempt0=${d0}`);
      const d2 = rateLimitRetryDelay(2, 1000, 60_000);
      assert.ok(d2 >= 3200 && d2 <= 4800, `attempt2=${d2}`);
    }
  });

  it("caps near maxMs", () => {
    for (let i = 0; i < 10; i++) {
      const d = rateLimitRetryDelay(10, 1000, 30_000);
      assert.ok(d >= 24_000 && d <= 30_000, `capped=${d}`);
    }
  });

  it("treats negative attempt as 0", () => {
    const d = rateLimitRetryDelay(-1, 1000, 30_000);
    assert.ok(d >= 800 && d <= 1200);
  });
});
