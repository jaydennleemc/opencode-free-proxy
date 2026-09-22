"use client";

import { useEffect, useState } from "react";
import type { KeyEntry } from "@/lib/types";

export default function KeysPanel() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<KeyEntry | null>(null);

  async function load() {
    const res = await fetch("/api/keys", { cache: "no-store" });
    if (res.status === 403) {
      setAdmin(false);
      return;
    }
    if (!res.ok) {
      setAdmin(false);
      return;
    }
    const body = await res.json().catch(() => ({ data: [] }));
    setAdmin(true);
    setKeys(body.data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  if (admin !== true) return null;

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
    const res = await fetch(`/api/keys/${encodeURIComponent(keyName)}`, {
      method: "DELETE",
    });
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
    <section className="mt-4 rounded-md border border-hairline bg-panel p-4">
      <h2 className="mb-3 text-[11px] uppercase tracking-widest text-dim">
        api keys
      </h2>

      <form onSubmit={createKey} className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="new key name (e.g. laptop)"
          className="tnum w-64 rounded-md border border-hairline bg-base px-3 py-1.5 text-xs text-ink outline-none placeholder:text-dim/50 focus:border-teal"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="tnum rounded-md bg-teal/15 px-3 py-1.5 text-xs text-teal transition-colors hover:bg-teal/25 disabled:opacity-40"
        >
          create key
        </button>
      </form>

      {created && (
        <div className="tnum mb-3 flex flex-wrap items-center gap-2 rounded-md border border-teal/40 bg-teal/10 px-3 py-2 text-xs">
          <span className="text-dim">created</span>
          <span className="text-ink">{created.name}</span>
          <span className="text-teal">{created.key}</span>
          <button
            onClick={() => copy(created.key, "created")}
            className="rounded-sm bg-hairline/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim hover:text-ink"
          >
            {copied === "created" ? "copied" : "copy"}
          </button>
        </div>
      )}

      {actionError && (
        <p className="tnum mb-3 rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
          {actionError}
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="tnum border-b border-hairline text-left text-[11px] uppercase tracking-wider text-dim">
            <th className="py-2 font-normal">name</th>
            <th className="py-2 font-normal">key</th>
            <th className="py-2 text-right font-normal">actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.name} className="tnum border-b border-hairline/50 text-xs last:border-0">
              <td className="py-2 text-ink">{k.name}</td>
              <td className="py-2 text-dim">
                {k.key.slice(0, 10)}…{k.key.slice(-4)}
                <button
                  onClick={() => copy(k.key, k.name)}
                  className="ml-2 rounded-sm bg-hairline/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim hover:text-ink"
                >
                  {copied === k.name ? "copied" : "copy"}
                </button>
              </td>
              <td className="py-2 text-right">
                {k.name !== "admin" && (
                  <button
                    onClick={() => removeKey(k.name)}
                    className="rounded-sm bg-red/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red hover:bg-red/20"
                  >
                    delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
