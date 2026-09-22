"use client";

import { useState } from "react";

export default function LoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `login failed (HTTP ${res.status})`);
        return;
      }
      window.location.replace("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="stagger-enter mb-6 flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
          </span>
          <h1 className="tnum text-sm font-semibold uppercase tracking-[0.2em]">
            opencode proxy · metrics
          </h1>
        </div>

        <form
          onSubmit={submit}
          className="stagger-enter surface-elevated rounded-xl bg-panel p-5"
        >
          <label
            htmlFor="key"
            className="text-[11px] uppercase tracking-widest text-dim"
          >
            api key
          </label>
          <input
            id="key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="oc-…"
            autoFocus
            className="tnum mt-2 w-full rounded-lg border border-hairline bg-base px-3 py-2 text-sm text-ink placeholder:text-dim/50 focus:border-teal focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2 transition-[border-color,box-shadow] duration-150 ease-out"
          />
          <p className="mt-2 text-xs text-dim">
            Use the admin key to also manage API keys. Find keys with{" "}
            <code className="tnum text-ink">
              docker exec opencode-proxy cat /data/api-keys.json
            </code>
          </p>
          {error && (
            <p className="tnum mt-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="tnum press-scale focus-ring mt-4 w-full rounded-lg bg-teal/15 px-3 py-2 text-sm text-teal transition-[color,background-color] duration-150 ease-out hover:bg-teal/25 disabled:opacity-40"
          >
            {busy ? "checking…" : "log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
