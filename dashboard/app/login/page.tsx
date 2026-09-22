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
        {/* Logo */}
        <div className="stagger stagger-1 mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text">opencode proxy</h1>
          <p className="mt-1 text-sm text-muted">Metrics dashboard</p>
        </div>

        {/* Form */}
        <form
          onSubmit={submit}
          className="stagger stagger-2 surface-raised p-6"
        >
          <label htmlFor="key" className="block text-xs font-medium text-muted">
            API Key
          </label>
          <input
            id="key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="oc-…"
            autoFocus
            className="tnum mt-2 w-full rounded-lg border border-border-subtle bg-base px-4 py-3 text-sm text-text placeholder:text-muted focus:border-cyan focus-visible:outline-2 focus-visible:outline-cyan focus-visible:outline-offset-2 transition-[border-color] duration-150"
          />
          <p className="mt-2 text-xs text-muted">
            Admin key grants access to key management.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="press-scale focus-ring mt-5 w-full rounded-lg bg-cyan/15 py-3 text-sm font-medium text-cyan transition-colors duration-150 hover:bg-cyan/25 disabled:opacity-40"
          >
            {busy ? "Checking…" : "Log in"}
          </button>
        </form>

        <p className="stagger stagger-3 mt-4 text-center text-xs text-muted">
          Find your keys:{" "}
          <code className="tnum text-muted">
            docker exec opencode-proxy cat /data/api-keys.json
          </code>
        </p>
      </div>
    </main>
  );
}
