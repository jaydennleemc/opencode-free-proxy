"use client";

import useSWR from "swr";
import { useState } from "react";
import type { MetricsResponse, Range } from "@/lib/types";
import { RANGES } from "@/lib/types";
import { compact, latency, clock, dateClock } from "@/lib/format";
import StatCard from "./stat-card";
import TokensChart from "./tokens-chart";
import ModelChart from "./model-chart";

const fetcher = async (url: string): Promise<MetricsResponse> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
};

export default function Dashboard() {
  const [range, setRange] = useState<Range>("24h");
  const { data, error, isLoading } = useSWR<MetricsResponse>(
    `/api/metrics?range=${range}`,
    fetcher,
    { refreshInterval: 5000, keepPreviousData: true },
  );

  const totals = data?.totals;
  const totalTokens = (totals?.inputTokens ?? 0) + (totals?.outputTokens ?? 0);
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
          <nav className="flex overflow-hidden rounded-md border border-hairline">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`tnum px-3 py-1.5 text-xs transition-colors ${
                  range === r
                    ? "bg-teal/15 text-teal"
                    : "text-dim hover:text-ink"
                }`}
              >
                {r}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── error banner (keeps last good data visible) ── */}
      {error && (
        <div className="tnum mt-4 rounded-md border border-red/40 bg-red/10 px-4 py-2 text-xs text-red">
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
          <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="tokens"
              value={compact(totalTokens)}
              sub={`${compact(totals!.inputTokens)} in · ${compact(totals!.outputTokens)} out`}
            />
            <StatCard label="requests" value={compact(totals!.requests)} />
            <StatCard
              label="error rate"
              value={errorRate}
              accent={totals!.errors > 0 ? "red" : undefined}
              sub={`${totals!.errors} failed`}
            />
            <StatCard
              label="avg latency"
              value={latency(totals!.avgLatencyMs)}
            />
          </section>

          {/* ── tokens over time ── */}
          <section className="mt-4 rounded-md border border-hairline bg-panel p-4">
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

          {/* ── model + key breakdowns ── */}
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-hairline bg-panel p-4">
              <h2 className="mb-2 text-[11px] uppercase tracking-widest text-dim">
                tokens by model
              </h2>
              <ModelChart rows={data.byModel} />
            </div>
            <div className="rounded-md border border-hairline bg-panel p-4">
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
                      className="tnum border-b border-hairline/50 last:border-0"
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

          {/* ── recent errors ── */}
          {data.recentErrors.length > 0 && (
            <section className="mt-4 rounded-md border border-hairline bg-panel p-4">
              <h2 className="mb-2 text-[11px] uppercase tracking-widest text-dim">
                recent errors
              </h2>
              <ul className="divide-y divide-hairline/50">
                {data.recentErrors.map((e, i) => (
                  <li
                    key={`${e.ts}-${i}`}
                    className="tnum flex flex-wrap items-baseline gap-x-3 py-2 text-xs"
                  >
                    <span className="text-dim">{dateClock(e.ts)}</span>
                    <span className="rounded-sm bg-hairline/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">
                      {e.endpoint}
                    </span>
                    <span className="text-violet">{e.model}</span>
                    <span className="grow truncate text-red">
                      {e.error || "unknown error"}
                    </span>
                    <span className="text-dim">{latency(e.latencyMs)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
