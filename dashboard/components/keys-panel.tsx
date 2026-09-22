"use client";

import { useEffect, useState } from "react";
import type { KeyEntry } from "@/lib/types";

export default function KeysPanel({ onAdminCheck }: { onAdminCheck?: (v: boolean) => void }) {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<KeyEntry | null>(null);

  async function load() {
    const res = await fetch("/api/keys", { cache: "no-store" });
    if (res.status === 403 || !res.ok) {
      setAdmin(false);
      onAdminCheck?.(false);
      return;
    }
    const body = await res.json().catch(() => ({ data: [] }));
    setAdmin(true);
    onAdminCheck?.(true);
    setKeys(body.data ?? []);
  }

  useEffect(() => { load(); }, []);

  if (admin === null) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted">
        Checking permissions…
      </div>
    );
  }

  if (admin === false) {
    return (
      <div className="surface p-8 text-center">
        <p className="text-sm text-muted">
          Key management requires the admin key.
        </p>
        <p className="tnum mt-2 text-xs text-muted">
          Log in with the admin key to manage API keys.
        </p>
      </div>
    );
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    setCreated(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(body.error?.message || body.error || `HTTP ${res.status}`);
        return;
      }
      setCreated(body);
      setName("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(keyName: string) {
    if (!window.confirm(`Delete key "${keyName}"? Clients using it will stop working.`))
      return;
    setActionError("");
    const res = await fetch(`/api/keys/${encodeURIComponent(keyName)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error?.message || body.error || `HTTP ${res.status}`);
      return;
    }
    load();
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="surface p-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted">
          Create new key
        </h2>
        <form onSubmit={createKey} className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. laptop, ci-runner"
            className="tnum flex-1 rounded-lg border border-border-subtle bg-base px-4 py-2.5 text-sm text-text placeholder:text-muted focus:border-cyan focus-visible:outline-2 focus-visible:outline-cyan focus-visible:outline-offset-2 transition-[border-color] duration-150"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="press-scale focus-ring rounded-lg bg-cyan/15 px-5 py-2.5 text-sm font-medium text-cyan transition-colors duration-150 hover:bg-cyan/25 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </form>

        {created && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-green/30 bg-green/10 px-4 py-3 text-sm">
            <span className="text-muted">Created</span>
            <span className="font-medium text-text">{created.name}</span>
            <code className="tnum text-cyan">{created.key}</code>
            <button
              onClick={() => copy(created.key, "created")}
              className="press-scale rounded-md bg-white/5 px-2 py-1 text-xs text-muted hover:text-text transition-colors duration-100"
            >
              {copied === "created" ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {actionError && (
          <p className="mt-3 rounded-lg border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
            {actionError}
          </p>
        )}
      </div>

      {/* Keys list */}
      <div className="surface overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Active keys ({keys.length})
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 pb-2 font-medium">Name</th>
              <th className="px-5 pb-2 font-medium">Key</th>
              <th className="px-5 pb-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr
                key={k.name}
                className="border-b border-border-subtle last:border-0 hover:bg-white/[0.02] transition-colors duration-100"
              >
                <td className="px-5 py-3">
                  <span className="font-medium text-text">{k.name}</span>
                  {k.name === "admin" && (
                    <span className="ml-2 rounded-md bg-cyan/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan">
                      admin
                    </span>
                  )}
                </td>
                <td className="tnum px-5 py-3 text-muted">
                  {k.key.slice(0, 12)}…{k.key.slice(-4)}
                  <button
                    onClick={() => copy(k.key, k.name)}
                    className="press-scale ml-2 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-muted hover:text-text transition-colors duration-100"
                  >
                    {copied === k.name ? "Copied!" : "Copy"}
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  {k.name !== "admin" ? (
                    <button
                      onClick={() => removeKey(k.name)}
                      className="press-scale rounded-md bg-red/10 px-2 py-1 text-[10px] font-medium text-red hover:bg-red/20 transition-colors duration-100"
                    >
                      Delete
                    </button>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
