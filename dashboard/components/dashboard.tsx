"use client";

import useSWR from "swr";
import { useState } from "react";
import type { MetricsResponse, Range } from "@/lib/types";
import { RANGES } from "@/lib/types";
import { compact, latency, clock } from "@/lib/format";
import StatCard from "./stat-card";
import TokensChart from "./tokens-chart";
import ModelChart from "./model-chart";
import RecentTable from "./recent-table";
import KeysPanel from "./keys-panel";

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

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export default function Dashboard() {
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* ── status-board header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${error ? "bg-red" : "bg-teal"}`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${error ? "bg-red" : "bg-teal"}`}
            />
          </span>
          <h1 className="tnum text-sm font-semibold uppercase tracking-[0.2em] text-ink">
            opencode proxy · metrics
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <span className="tnum text-xs text-dim">
              updated {clock(Date.now())}
            </span>
          )}
          <nav
            className="flex overflow-hidden rounded-lg"
            role="tablist"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className={`tnum press-scale focus-ring px-3 py-1.5 text-xs ${
                  range === r
                    ? "bg-teal/15 text-teal"
                    : "text-dim hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </nav>
          <button
            onClick={logout}
            className="tnum press-scale focus-ring rounded-lg border border-hairline px-3 py-1.5 text-xs text-dim transition-[color,box-shadow] hover:text-ink"
          >
            log out
          </button>
        </div>
      </header>

      {/* ── error banner ── */}
      {error && (
        <div className="tnum mt-4 rounded-lg border border-red/40 bg-red/10 px-4 py-2 text-xs text-red">
          proxy feed unavailable — {error.message}
          {data ? " · showing last good data" : ""}
        </div>
      )}

      {isLoading && !data ? (
        <div className="tnum py-24 text-center text-sm text-dim">
          connecting to proxy…
        </div>
      ) : !data ? null : data.totals.requests === 0 ? (
        <div className="py-24 text-center">
          <p className="text-sm text-ink">No requests recorded yet.</p>
          <p className="tnum mt-2 text-xs text-dim">
            send traffic through the proxy, then this board fills itself in
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI row ── */}
          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="stagger-enter">
              <StatCard
                label="input tokens"
                value={compact(totals!.inputTokens)}
                accent="teal"
              />
            </div>
            <div className="stagger-enter">
              <StatCard
                label="output tokens"
                value={compact(totals!.outputTokens)}
                accent="violet"
              />
            </div>
            <div className="stagger-enter">
              <StatCard label="requests" value={compact(totals!.requests)} />
            </div>
            <div className="stagger-enter">
              <StatCard
                label="error rate"
                value={errorRate}
                accent={totals!.errors > 0 ? "red" : undefined}
                sub={`${totals!.errors} failed`}
              />
            </div>
            <div className="stagger-enter">
              <StatCard
                label="avg latency"
                value={latency(totals!.avgLatencyMs)}
              />
            </div>
          </section>

          {/* ── tokens over time ── */}
          <section className="stagger-enter mt-4 rounded-lg bg-panel p-4 surface">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-widest text-dim">
                tokens over time
              </h2>
              <div className="tnum flex gap-4 text-[11px] text-dim">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-sm bg-teal" /> input
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-sm bg-violet" />{" "}
                  output
                </span>
              </div>
            </div>
            <TokensChart series={data.series} bucketMs={data.bucketMs} />
          </section>

          {/* ── recent requests ── */}
          <section className="stagger-enter mt-4 rounded-lg bg-panel p-4 surface">
            <h2 className="mb-2 text-[11px] uppercase tracking-widest text-dim">
              recent requests
            </h2>
            <RecentTable rows={data.recent} />
          </section>

          {/* ── model + key breakdowns ── */}
          <section className="stagger-enter mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg bg-panel p-4 surface">
              <h2 className="mb-2 text-[11px] uppercase tracking-widest text-dim">
                tokens by model
              </h2>
              <ModelChart rows={data.byModel} />
            </div>
            <div className="rounded-lg bg-panel p-4 surface">
              <h2 className="mb-2 text-[11px] uppercase tracking-widest text-dim">
                by api key
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="tnum border-b border-hairline text-left text-[11px] uppercase tracking-wider text-dim">
                    <th className="py-2 font-normal">key</th>
                    <th className="py-2 text-right font-normal">requests</th>
                    <th className="py-2 text-right font-normal">tokens</th>
                    <th className="py-2 text-right font-normal">errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byKey.map((k) => (
                    <tr
                      key={k.keyLabel}
                      className="tnum border-b border-hairline/50 transition-[background-color] duration-100 last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="py-2 text-ink">{k.keyLabel}</td>
                      <td className="py-2 text-right">{compact(k.requests)}</td>
                      <td className="py-2 text-right">
                        {compact(k.inputTokens + k.outputTokens)}
                      </td>
                      <td
                        className={`py-2 text-right ${k.errors > 0 ? "text-red" : "text-dim"}`}
                      >
                        {k.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── key management (admin only) ── */}
          <div className="stagger-enter">
            <KeysPanel />
          </div>
        </>
      )}
    </main>
  );
}
