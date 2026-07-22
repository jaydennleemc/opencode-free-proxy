import { ocId } from "./utils.mjs";

const userSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

function cleanupStaleSessions() {
  const cutoff = Date.now() - SESSION_TTL;
  for (const [user, session] of userSessions) {
    if (session.ts < cutoff) {
      userSessions.delete(user);
    }
  }
}

const cleanupTimer = setInterval(cleanupStaleSessions, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

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

export function sessionCount() {
  return userSessions.size;
}
