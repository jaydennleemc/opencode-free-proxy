import fs from "fs";
import crypto from "crypto";
import { KEYS_FILE } from "./config/index.mjs";
import { logLine } from "./logger.mjs";

export const apiKeys = {};

export function loadKeys() {
  try {
    Object.assign(apiKeys, JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")));
  } catch {}
  if (Object.keys(apiKeys).length === 0) {
    Object.assign(apiKeys, {
      admin: process.env.ADMIN_API_KEY || "oc-" + crypto.randomBytes(20).toString("hex"),
      "user-default": process.env.USER_DEFAULT_API_KEY || "oc-" + crypto.randomBytes(20).toString("hex"),
    });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(apiKeys, null, 2));
    logLine("Generated new API keys →", KEYS_FILE);
    return;
  }
  // Env vars override the persisted file — an explicitly set key must win,
  // otherwise a reused volume silently ignores the operator's key.
  let changed = false;
  for (const [name, envVar] of [["admin", "ADMIN_API_KEY"], ["user-default", "USER_DEFAULT_API_KEY"]]) {
    const v = process.env[envVar];
    if (v && apiKeys[name] !== v) {
      apiKeys[name] = v;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(apiKeys, null, 2));
    logLine("Applied API key overrides from env →", KEYS_FILE);
  }
}

function persist() {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(apiKeys, null, 2));
}

/** Create a new key under `name`. Returns the key, or null if name is taken/invalid. */
export function addKey(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return null;
  if (apiKeys[name]) return null;
  apiKeys[name] = "oc-" + crypto.randomBytes(20).toString("hex");
  persist();
  return apiKeys[name];
}

/** Delete a key by name. "admin" is protected against lockout. */
export function deleteKey(name) {
  if (!apiKeys[name] || name === "admin") return false;
  delete apiKeys[name];
  persist();
  return true;
}

export function auth(req) {
  const hdr = req.headers.authorization || req.headers["x-api-key"] || "";
  const tok = hdr.startsWith("Bearer ") ? hdr.slice(7) : hdr;
  const tokBuf = Buffer.from(tok);
  for (const [name, key] of Object.entries(apiKeys)) {
    const keyBuf = Buffer.from(key);
    if (keyBuf.length === tokBuf.length && crypto.timingSafeEqual(keyBuf, tokBuf)) return name;
  }
  return null;
}
