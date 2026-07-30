import { ocId } from "./utils.mjs";

const userSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

export function getSession(user) {
  const now = Date.now();
  const existing = userSessions.get(user);
  if (!existing || now - existing.ts > SESSION_TTL) {
    const session = { id: ocId("ses"), ts: now };
    userSessions.set(user, session);
    return session.id;
  }
  // Bump timestamp on activity so active sessions stay alive.
  existing.ts = now;
  return existing.id;
}
