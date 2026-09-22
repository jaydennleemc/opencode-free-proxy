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

function shutdown(signal) {
  for (const child of children) child.kill(signal);
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

for (const child of children) {
  child.on("exit", (code, signal) => {
    console.error(`[launcher] child exited (code=${code} signal=${signal}), shutting down`);
    shutdown("SIGTERM");
    process.exitCode = code ?? 1;
  });
}

console.log(
  `[launcher] proxy :${PROXY_PORT} + dashboard :${DASHBOARD_PORT} starting`,
);
