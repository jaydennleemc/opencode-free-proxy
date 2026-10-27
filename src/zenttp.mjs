import { Readable } from "stream";
import { EventEmitter } from "events";

/**
 * Fetch-based transport that mimics the exact `https.request` callback shape the
 * pipes expect (`req.write/end/destroy/emit("timeout")`, `zenRes.statusCode`,
 * `zenRes.headers` as a plain object, `zenRes.on("data"/"end"/"close")`).
 *
 * MUST run under Bun: the inference gate fingerprints the client at the TLS
 * layer, and Bun's fetch is the only runtime stack that passes (node https and
 * node http2 both get 429 FreeUsageLimitError with identical bodies/headers).
 * Inactivity timeout mirrors the old `timeout: 120000` socket behaviour by
 * resetting on every chunk.
 */
export function request(zenOpts, onResponse) {
  return impl(zenOpts, onResponse);
}

let impl = defaultTransport;

/** Test seam: swap the transport (e.g. with a scripted fake). */
export function setRequest(fn) {
  impl = fn;
}

export function defaultTransport(zenOpts, onResponse) {
  const url = `https://${zenOpts.hostname}:${zenOpts.port ?? 443}${zenOpts.path}`;
  const idleMs = zenOpts.timeout || 120000;

  const req = new EventEmitter();
  const chunks = [];
  let destroyed = false;
  let ac = null;
  let idleTimer = null;
  let fired = false;

  req.write = (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return true; };
  req.destroy = () => {
    destroyed = true;
    clearTimeout(idleTimer);
    ac?.abort();
  };

  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (destroyed || fired) return;
      fired = true;
      req.emit("timeout");
    }, idleMs);
  };

  req.end = async (last) => {
    if (last != null) chunks.push(Buffer.isBuffer(last) ? last : Buffer.from(last));
    if (destroyed) return;
    const body = Buffer.concat(chunks);
    ac = new AbortController();
    armIdle();
    try {
      const res = await fetch(url, { method: zenOpts.method || "POST", headers: zenOpts.headers, body, signal: ac.signal });
      if (destroyed) return;
      const zenRes = Readable.fromWeb(res.body, { highWaterMark: 16 * 1024 });
      zenRes.statusCode = res.status;
      zenRes.headers = Object.fromEntries(res.headers);
      zenRes.complete = false;
      zenRes.on("data", () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (destroyed || fired) return;
          fired = true;
          req.emit("timeout");
        }, idleMs);
      });
      zenRes.on("end", () => { zenRes.complete = true; });
      zenRes.on("close", () => { clearTimeout(idleTimer); });
      onResponse(zenRes);
    } catch (err) {
      clearTimeout(idleTimer);
      if (!destroyed && !fired) req.emit("error", err);
    }
  };

  return req;
}
