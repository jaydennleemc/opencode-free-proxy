import crypto from "crypto";

export function ocId(prefix) {
  const ts = Date.now().toString(16);
  const rnd = crypto.randomBytes(12).toString("base64url").slice(0, 16);
  return `${prefix}_${ts}${rnd}`;
}

/** Check if the first response chunk from Zen API signals a rate-limit or error. */
export function checkFirstChunkError(chunk) {
  const str = chunk.toString().trim();
  if (!str.startsWith("{") || (!str.includes("FreeUsageLimitError") && !str.includes('"error"'))) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed.error || parsed.type === "error") {
      return parsed.error?.message || parsed.message || "Rate limit exceeded";
    }
  } catch {}
  return null;
}
