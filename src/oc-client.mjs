import { OC_BASE_URL, OC_AGENT, OC_PROVIDER } from "./config/index.mjs";

/**
 * OpenCode serve (`opencode serve`) local session API client.
 * The proxy no longer talks to the Zen API directly — requests are relayed
 * through a real OpenCode instance, which is the only thing the free tier
 * still accepts traffic from.
 */

function base(path) {
  return `${OC_BASE_URL}${path}`;
}

function assertOk(res, body, what) {
  if (res.ok) return;
  const msg = body?.error?.data?.message || body?.error?.message || JSON.stringify(body).slice(0, 500);
  const err = new Error(`opencode ${what} failed: HTTP ${res.status}: ${msg}`);
  err.status = res.status;
  throw err;
}

export async function createSession() {
  const res = await fetch(base("/session"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await res.json().catch(() => null);
  assertOk(res, body, "session create");
  return body;
}

export async function deleteSession(sessionID) {
  const res = await fetch(base(`/session/${sessionID}`), { method: "DELETE" });
  return res.ok;
}

/** Append history without a model reply (context caching for multi-turn). */
export async function cacheMessages(sessionID, model, parts) {
  const res = await fetch(base(`/session/${sessionID}/message`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: { providerID: OC_PROVIDER, modelID: model },
      agent: OC_AGENT,
      noReply: true,
      parts,
    }),
  });
  const body = await res.json().catch(() => null);
  assertOk(res, body, "cache messages");
  return body;
}

/**
 * Send a prompt and wait for the completed assistant reply.
 * Timeout: hangs forever on `prompt` (busy sessions can queue), so we race a
 * timer — caller must abort the stuck session.
 */
export async function sendPrompt(sessionID, model, text, system, timeoutMs = 120_000) {
  const payload = {
    model: { providerID: OC_PROVIDER, modelID: model },
    agent: OC_AGENT,
    parts: [{ type: "text", text }],
  };
  if (system) payload.system = system;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`opencode prompt timeout after ${timeoutMs}ms`);
      err.code = "OC_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });

  try {
    const res = await Promise.race([
      fetch(base(`/session/${sessionID}/message`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      timeout,
    ]);
    const body = await res.json().catch(() => null);
    assertOk(res, body, "prompt");
    return body; // { info: AssistantMessage, parts: Part[] }
  } finally {
    clearTimeout(timer);
  }
}

export async function abortSession(sessionID) {
  await fetch(base(`/session/${sessionID}/abort`), { method: "POST" }).catch(() => {});
}

export async function health() {
  const res = await fetch(base("/session"), { method: "GET" });
  return res.ok;
}
