import { spawn } from "child_process";
import { createRequire } from "module";
import { mkdirSync, existsSync } from "fs";
import { setTimeout as delay } from "timers/promises";
import { OC_PORT, OC_BASE_URL, PROXY_VERSION } from "./config/index.mjs";
import { logLine } from "./logger.mjs";

const WORKDIR = "/tmp/oc-proxy-workdir";

/** Find the opencode binary: bundled npm dep first, PATH (dev) as fallback. */
export function resolveOpencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const require = createRequire(import.meta.url);
  const arch = { arm64: "arm64", x64: "x64" }[process.arch];
  const plat = { darwin: "darwin", linux: "linux", win32: "windows" }[process.platform];
  // Alpine (musl) can't run the glibc binary — opencode ships a -musl variant.
  const musl =
    plat === "linux" &&
    existsSync("/etc/alpine-release");
  const name = `opencode-${plat}-${arch}${musl ? "-musl" : ""}/bin/opencode`;
  try {
    return require.resolve(name);
  } catch {
    return "opencode"; // dev machines with opencode on PATH
  }
}

export async function waitReady(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${OC_BASE_URL}/session`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await delay(500);
  }
  throw new Error(`opencode serve not ready after ${timeoutMs}ms (${lastErr})`);
}

/** Spawn `opencode serve` and wait until its API answers. */
export async function startOpencode() {
  mkdirSync(WORKDIR, { recursive: true });

  const bin = resolveOpencodeBin();
  const args = ["serve", "--port", String(OC_PORT), "--hostname", "127.0.0.1"];
  logLine(`OpenCode Free Proxy v${PROXY_VERSION}: spawning ${bin} ${args.join(" ")}`);

  const child = spawn(bin, args, {
    cwd: WORKDIR,
    env: {
      ...process.env,
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  child.on("exit", (code) => {
    logLine(`opencode serve exited (code ${code}), restarting in 2s`);
    setTimeout(() => startOpencode().catch(() => {}), 2000);
  });

  await waitReady();
  logLine(`opencode serve ready at ${OC_BASE_URL}`);
  return child;
}
