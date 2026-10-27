import fs from "fs";
import { ocId } from "./utils.mjs";
import { OC_VERSION } from "./config/index.mjs";
import { request } from "./zenttp.mjs";

/** Names Zen's free-tier gate requires on the request. Extras are allowed. */
export const FINGERPRINT_TOOLS = ["bash", "glob", "grep", "read"];

/**
 * The gate (2026-10) serves free models only to requests whose system prompt
 * looks like the official OpenCode agent, so we ship it verbatim and wrap the
 * client's own system prompt onto its tail. Content is the axis (a truncated
 * prefix or same-size padding still gets 429), not size or tools.
 */
const OFFICIAL_SYSTEM = fs.readFileSync(
  new URL("../fingerprint/official-system.txt", import.meta.url),
  "utf8",
);

const DECOY_DESCRIPTION = "This tool is currently unavailable and must not be used.";

function decoyTool(name) {
  return {
    type: "function",
    function: {
      name,
      description: DECOY_DESCRIPTION,
      parameters: { type: "object", properties: {} },
    },
  };
}

function toolName(t) {
  return t?.function?.name || t?.name || "";
}

/** Merge caller tools with the fingerprint quartet. Never duplicates a name. */
export function ensureFingerprintTools(tools) {
  const list = Array.isArray(tools) ? tools.filter((t) => toolName(t)) : [];
  const names = new Set(list.map(toolName));
  for (const name of FINGERPRINT_TOOLS) {
    if (!names.has(name)) list.push(decoyTool(name));
  }
  return list;
}

function systemTextOf(msg) {
  if (typeof msg?.content === "string") return msg.content;
  if (Array.isArray(msg?.content)) {
    return msg.content
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("\n");
  }
  return "";
}

/**
 * Official agent system first, the client's own system prompt appended.
 * Verified against the live gate: multi-message systems and merged tail both
 * pass; merging keeps providers that dislike duplicate system roles happy.
 */
export function wrapSystem(messages) {
  const list = Array.isArray(messages) ? [...messages] : [];
  const idx = list.findIndex((m) => m?.role === "system");
  const clientSys = idx >= 0 ? systemTextOf(list[idx]) : "";
  if (idx >= 0) list.splice(idx, 1);
  const sys = clientSys ? `${OFFICIAL_SYSTEM}\n\n${clientSys}` : OFFICIAL_SYSTEM;
  return [{ role: "system", content: sys }, ...list];
}

export function zenRequest(model, messages, _stream, tools, tool_choice, sessionId) {
  // Inference gate (2026-10): free tier only from inside OpenCode. Required
  // fingerprint (captured from official client 2.1.4): bun fetch TLS + its UA +
  // session headers + the official agent system prompt as the first message.
  const hadClientTools = Array.isArray(tools) && tools.length > 0;
  const reqBody = {
    model,
    messages: wrapSystem(messages),
    stream: true,
    tools: ensureFingerprintTools(tools),
  };
  if (tool_choice) reqBody.tool_choice = tool_choice;
  else if (!hadClientTools) reqBody.tool_choice = "none";
  const body = JSON.stringify(reqBody);

  return {
    body,
    options: {
      hostname: "opencode.ai",
      port: 443,
      path: "/inference/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "Authorization": "Bearer public",
        "User-Agent": `opencode/latest/${OC_VERSION}/cli`,
        "x-opencode-client": "cli",
        "x-opencode-project": "18e62f0f6d18dec370f659f7c62e5b994dabda71",
        "x-opencode-session": sessionId,
        "x-opencode-session-id": sessionId,
        "x-session-affinity": sessionId,
        "x-session-id": sessionId,
      },
      timeout: 120000,
    },
  };
}

/** Aggregate one (always-stream) Zen reply into a sync JSON body. */
export function zenRequestFull(zenOpts, body) {
  return new Promise((resolve, reject) => {
    const req = request(zenOpts, (zenRes) => {
      const chunks = [];
      zenRes.on("data", (c) => chunks.push(c));
      zenRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const headers = zenRes.headers;
        try {
          resolve({ status: zenRes.statusCode, data: JSON.parse(raw), raw, headers });
        } catch {
          resolve({ status: zenRes.statusCode, data: null, raw, headers });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}
