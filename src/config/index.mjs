import fs from "fs";

export const PORT = process.env.PROXY_PORT || 6446;
export const OC_VERSION = "1.18.31";

// ── upstream: local opencode serve instance ─────────────────────────────────
export const OC_PORT = Number(process.env.OPENCODE_PORT) || 4096;
export const OC_BASE_URL = (process.env.OPENCODE_URL || `http://127.0.0.1:${OC_PORT}`).replace(/\/$/, "");
// Free-tier gate rejects requests from custom agents — must use a native one.
export const OC_AGENT = process.env.OPENCODE_AGENT || "build";
export const OC_PROVIDER = process.env.OPENCODE_PROVIDER || "opencode";
/** Max wait for one prompt reply (busy sessions queue inside opencode). */
export const OC_TIMEOUT_MS = Math.max(1000, Number(process.env.OC_TIMEOUT_MS) || 120_000);

const pkg = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
export const PROXY_VERSION = pkg.version;

export const MODELS = JSON.parse(
  fs.readFileSync(new URL("../../models.json", import.meta.url), "utf8"),
);
export const KEYS_FILE = process.env.KEYS_FILE || "./api-keys.json";

/** Base delay for first retry; doubles each attempt. */
export const RETRY_BASE_MS = Math.max(0, Number(process.env.RETRY_BASE_MS) || 1000);
/** Cap for exponential backoff. */
export const RETRY_MAX_MS = Math.max(0, Number(process.env.RETRY_MAX_MS) || 30_000);
