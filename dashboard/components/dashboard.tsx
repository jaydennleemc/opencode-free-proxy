"use client";

import useSWR from "swr";
import { useState } from "react";
import type { MetricsResponse, Range } from "@/lib/types";
import { RANGES } from "@/lib/types";
import { compact, latency, clock } from "@/lib/format";
import { useEffect } from "react";
import Sidebar, { type Tab } from "./sidebar";
import StatCard from "./stat-card";
import TokensChart from "./tokens-chart";
import ModelChart from "./model-chart";
import RecentTable from "./recent-table";
import KeysPanel from "./keys-panel";

// Probe admin status on mount (independent of which tab is active)
function AdminProbe({ onResult }: { onResult: (v: boolean) => void }) {
  useEffect(() => {
    fetch("/api/keys", { cache: "no-store" })
      .then((r) => onResult(r.ok))
      .catch(() => onResult(false));
  }, [onResult]);
  return null;
}

const fetcher = async (url: string): Promise<MetricsResponse> => {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("not logged in");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
};

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("24h");
  const { data, error, isLoading } = useSWR<MetricsResponse>(
    `/api/metrics?range=${range}`,
    fetcher,
    { refreshInterval: 5000, keepPreviousData: true },
  );

  const totals = data?.totals;
  const errorRate =
    totals && totals.requests > 0
      ? ((totals.errors / totals.requests) * 100).toFixed(1) + "%"
      : "0%";

  const [admin, setAdmin] = useState<boolean | null>(null);

  return (
    <div className="min-h-screen">
      <AdminProbe onResult={setAdmin} />
      <Sidebar active={tab} onNav={setTab} admin={admin ?? false} error={!!error} />

      <div className="px-4 py-6 md:ml-0 md:px-8 md:py-8">
        {/* ── Top bar ── */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text">
              {tab === "overview" && "Overview"}
              {tab === "activity" && "Activity"}
              {tab === "keys" && "API Keys"}
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {data && `Updated ${clock(Date.now())}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border-subtle bg-surface">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`tnum px-3 py-1.5 text-xs transition-colors duration-150 ${
                    range === r
                      ? "bg-cyan/15 text-cyan"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 rounded-lg border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">
            Proxy unreachable — {error.message}
            {data ? " · showing cached data" : ""}
          </div>
        )}

        {isLoading && !data ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted">
            Connecting to proxy…
          </div>
        ) : !data ? null : data.totals.requests === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="text-sm text-text">No requests recorded yet.</p>
            <p className="mt-1 text-xs text-muted">
              Send traffic through the proxy to see data here.
            </p>
          </div>
        ) : (
          <>
            {/* ═══ OVERVIEW TAB ═══ */}
            {tab === "overview" && (
              <div className="space-y-6">
                {/* Hero stats */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  <div className="stagger stagger-1"><StatCard label="Input tokens" value={compact(totals!.inputTokens)} accent="cyan" /></div>
                  <div className="stagger stagger-2"><StatCard label="Output tokens" value={compact(totals!.outputTokens)} accent="violet" /></div>
                  <div className="stagger stagger-3"><StatCard label="Requests" value={compact(totals!.requests)} /></div>
                  <div className="stagger stagger-4"><StatCard label="Error rate" value={errorRate} accent={totals!.errors > 0 ? "red" : "green"} sub={`${totals!.errors} failed`} /></div>
                  <div className="stagger stagger-5"><StatCard label="Avg latency" value={latency(totals!.avgLatencyMs)} /></div>
                </div>

                {/* Chart */}
                <div className="stagger stagger-5 surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
                      Tokens over time
                    </h2>
                    <div className="tnum flex gap-4 text-[11px] text-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm bg-cyan" /> input
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm bg-violet" /> output
                      </span>
                    </div>
                  </div>
                  <TokensChart series={data.series} bucketMs={data.bucketMs} />
                </div>

                {/* Model + key breakdown */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="stagger stagger-6 surface p-5">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                      Tokens by model
                    </h2>
                    <ModelChart rows={data.byModel} />
                  </div>
                  <div className="stagger stagger-7 surface p-5">
                    <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                      By API key
                    </h2>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                          <th className="pb-2 font-medium">Key</th>
                          <th className="pb-2 text-right font-medium">Requests</th>
                          <th className="pb-2 text-right font-medium">Tokens</th>
                          <th className="pb-2 text-right font-medium">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byKey.map((k) => (
                          <tr key={k.keyLabel} className="border-b border-border-subtle last:border-0 hover:bg-white/[0.02] transition-colors duration-100">
                            <td className="py-2.5 text-text">{k.keyLabel}</td>
                            <td className="tnum py-2.5 text-right text-muted">{compact(k.requests)}</td>
                            <td className="tnum py-2.5 text-right text-text">{compact(k.inputTokens + k.outputTokens)}</td>
                            <td className={`tnum py-2.5 text-right ${k.errors > 0 ? "text-red" : "text-muted"}`}>{k.errors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ ACTIVITY TAB ═══ */}
            {tab === "activity" && (
              <div className="space-y-6">
                <div className="surface p-5">
                  <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted">
                    Recent requests
                  </h2>
                  <RecentTable rows={data.recent} />
                </div>

                {/* Quick stats at bottom */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Total in" value={compact(totals!.inputTokens)} accent="cyan" />
                  <StatCard label="Total out" value={compact(totals!.outputTokens)} accent="violet" />
                  <StatCard label="Errors" value={String(totals!.errors)} accent={totals!.errors > 0 ? "red" : "green"} />
                  <StatCard label="Avg latency" value={latency(totals!.avgLatencyMs)} />
                </div>
              </div>
            )}

            {/* ═══ KEYS TAB ═══ */}
            {tab === "keys" && (
              <KeysPanel onAdminCheck={setAdmin} />
            )}
          </>
        )}
      </div>

      {/* Spacer for mobile bottom nav */}
      <div className="h-20 md:hidden" />
    </div>
  );
}
