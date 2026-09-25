// All-in-one container launcher: starts the proxy and the dashboard as child
// processes, forwards signals, and exits if either dies.
// Ensures api-keys.json exists so `docker run` works with zero configuration;
// the dashboard login accepts any of those keys (admin key enables key
// management).

import { spawn } from "child_process";

const PROXY_PORT = process.env.PROXY_PORT || "6446";
const DASHBOARD_PORT = process.env.DASHBOARD_PORT || process.env.PORT || "3000";

const { loadKeys } = await import("../src/auth.mjs");
loadKeys();

const children = [
  spawn(process.execPath, ["src/index.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PROXY_PORT },
  }),
  spawn(process.execPath, ["dashboard-server/server.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PROXY_URL: `http://127.0.0.1:${PROXY_PORT}`,
      PORT: DASHBOARD_PORT,
      HOSTNAME: "0.0.0.0",
    },
  }),
];

let forceExitScheduled = false;
let exitedCount = 0;

function shutdown(signal) {
  for (const child of children) child.kill(signal);
  if (forceExitScheduled) return;
  forceExitScheduled = true;
  // Ref'd timer (not unref'd): even if some handle keeps the event loop
  // alive, the launcher still force-exits here — a wedged child can never
  // leave the container running with a dead proxy.
  setTimeout(() => {
    console.error(
      `[launcher] ${children.length - exitedCount} child(ren) still alive after 500ms, exiting`,
    );
    process.exit(process.exitCode ?? 0);
  }, 500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

for (const child of children) {
  child.on("error", (err) => {
    console.error(`[launcher] child error: ${err.message}, shutting down`);
    process.exitCode = 1;
    shutdown("SIGTERM");
  });
  child.on("exit", (code, signal) => {
    console.error(`[launcher] child exited (code=${code} signal=${signal}), shutting down`);
    shutdown("SIGTERM");
    process.exitCode = code ?? 1;
    exitedCount++;
    if (exitedCount === children.length) {
      process.exit(process.exitCode ?? 0);
    }
  });
}

console.log(
  `[launcher] proxy :${PROXY_PORT} + dashboard :${DASHBOARD_PORT} starting`,
);
