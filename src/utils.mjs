import { randomBytes } from "crypto";

const LENGTH = 26;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const MASK_48 = (1n << 48n) - 1n;
/** Zen accepts a descending session only when this counter stays <= 63. */
const MAX_DESCENDING_COUNTER = 63;

let lastTimestamp = 0;
let counter = 0;
let lastSessionTimestamp = 0;
let sessionCounter = 0;

function randomBase62(length) {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) result += BASE62[bytes[i] % 62];
  return result;
}

function pack(timestamp, n, descending) {
  let now = BigInt(timestamp) * BigInt(0x1000) + BigInt(n);
  if (descending) now = (~now) & MASK_48;
  const timeBytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  }
  return timeBytes.toString("hex");
}

/**
 * OpenCode identifier: prefix_ + 12 hex time bytes + 14 base62 chars.
 * Session ids must be descending (Identifier.create("descending")). Zen's
 * free-tier gate 403s an ascending ses_ even when the rest of the
 * fingerprint is valid. Request ids stay ascending.
 */
export function ocId(prefix) {
  const descending = prefix === "ses";
  let timestamp = Date.now();
  let n;
  if (descending) {
    if (timestamp !== lastSessionTimestamp) {
      lastSessionTimestamp = timestamp;
      sessionCounter = 0;
    }
    sessionCounter++;
    if (sessionCounter > MAX_DESCENDING_COUNTER) {
      lastSessionTimestamp += 1;
      sessionCounter = 1;
    }
    timestamp = lastSessionTimestamp;
    n = sessionCounter;
  } else {
    if (timestamp !== lastTimestamp) {
      lastTimestamp = timestamp;
      counter = 0;
    }
    counter++;
    timestamp = lastTimestamp;
    n = counter;
  }
  return `${prefix}_${pack(timestamp, n, descending)}${randomBase62(LENGTH - 12)}`;
}
