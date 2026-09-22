import type { RecentRow } from "@/lib/types";
import { compact, latency, dateClock } from "@/lib/format";

export default function RecentTable({ rows }: { rows: RecentRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="pb-2 pr-4 font-medium">Time</th>
            <th className="pb-2 pr-4 font-medium">Endpoint</th>
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 text-right font-medium text-cyan">In</th>
            <th className="pb-2 pr-4 text-right font-medium text-violet">Out</th>
            <th className="pb-2 pr-4 text-right font-medium">Latency</th>
            <th className="pb-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.ts}-${i}`}
              className="border-b border-border-subtle text-xs last:border-0 hover:bg-white/[0.02] transition-colors duration-100"
            >
              <td className="tnum py-2.5 pr-4 whitespace-nowrap text-muted">
                {dateClock(r.ts)}
              </td>
              <td className="py-2.5 pr-4">
                <span className="rounded-md bg-raised px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                  {r.endpoint}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-text">{r.model}</td>
              <td className="tnum py-2.5 pr-4 text-right text-cyan">
                {compact(r.inputTokens)}
                {r.estimated && <span title="estimated" className="text-muted">~</span>}
              </td>
              <td className="tnum py-2.5 pr-4 text-right text-violet">
                {compact(r.outputTokens)}
                {r.estimated && <span title="estimated" className="text-muted">~</span>}
              </td>
              <td className="tnum py-2.5 pr-4 text-right text-muted">
                {latency(r.latencyMs)}
              </td>
              <td className={`tnum py-2.5 text-right ${r.status === "ok" ? "text-muted" : "text-red"}`}>
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
