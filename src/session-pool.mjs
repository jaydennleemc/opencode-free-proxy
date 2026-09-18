import { createSession, deleteSession } from "./oc-client.mjs";
import { logLine } from "./logger.mjs";

const POOL_SIZE = Math.max(1, Number(process.env.SESSION_POOL_SIZE) || 4);
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes — opencode's own free-tier cadence

/**
 * Pool of real OpenCode sessions, one per in-flight prompt.
 * One session must never run two prompts concurrently (opencode queues them),
 * so pool size also caps how many requests each API-key user can run at once.
 */

export class SessionPool {
  constructor() {
    this.sessions = []; // { id, ts, busy }
    this.waiters = [];
    this.filling = 0;
    this.cleanup = setInterval(() => this.evictStale(), 5 * 60 * 1000);
    this.cleanup.unref();
  }

  async fill() {
    while (this.sessions.length + this.filling < POOL_SIZE) {
      this.filling++;
      try {
        const s = await createSession();
        this.sessions.push({ id: s.id, ts: Date.now(), busy: false });
        logLine("SESSION created", s.id);
        this.release(null); // wake a waiter
      } catch (e) {
        logLine("SESSION create failed:", e.message);
        break;
      } finally {
        this.filling--;
      }
    }
  }

  evictStale() {
    const now = Date.now();
    for (const s of this.sessions) {
      if (!s.busy && now - s.ts > SESSION_TTL) this.discard(s, "ttl");
    }
  }

  discard(session, reason) {
    const i = this.sessions.indexOf(session);
    if (i === -1) return;
    this.sessions.splice(i, 1);
    deleteSession(session.id).catch(() => {});
    logLine("SESSION discarded", session.id, `(${reason})`);
    this.fill().catch(() => {});
  }

  async acquire() {
    const idle = this.sessions.find((s) => !s.busy);
    if (idle) {
      idle.busy = true;
      return idle;
    }
    this.fill().catch(() => {});
    return new Promise((resolve, reject) => {
      const w = { resolve, reject };
      this.waiters.push(w);
      w.cancel = () => {
        const i = this.waiters.indexOf(w);
        if (i !== -1) {
          this.waiters.splice(i, 1);
          reject(new Error("client disconnected"));
        }
      };
    });
  }

  release(session) {
    if (session) {
      session.busy = false;
      session.ts = Date.now();
    }
    const next = this.waiters.shift();
    if (!next) return;
    const idle = this.sessions.find((s) => !s.busy);
    if (idle) {
      idle.busy = true;
      next.resolve(idle);
    } else {
      this.waiters.unshift(next);
    }
  }
}

const pools = new Map(); // user -> SessionPool

export function getPool(user) {
  let pool = pools.get(user);
  if (!pool) {
    pool = new SessionPool();
    pools.set(user, pool);
    pool.fill().catch(() => {});
  }
  return pool;
}
