import type { RecentRow } from "@/lib/types";
import { compact, latency, dateClock } from "@/lib/format";

export default function RecentTable({ rows }: { rows: RecentRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="tnum border-b border-hairline text-left text-[11px] uppercase tracking-wider text-dim">
            <th className="py-2 pr-3 font-normal">time</th>
            <th className="py-2 pr-3 font-normal">endpoint</th>
            <th className="py-2 pr-3 font-normal">model</th>
            <th className="py-2 pr-3 text-right font-normal text-teal">in</th>
            <th className="py-2 pr-3 text-right font-normal text-violet">out</th>
            <th className="py-2 pr-3 text-right font-normal">latency</th>
            <th className="py-2 text-right font-normal">status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.ts}-${i}`}
              className="tnum border-b border-hairline/50 text-xs transition-[background-color] duration-100 last:border-0 hover:bg-white/[0.02]"
            >
              <td className="py-2 pr-3 whitespace-nowrap text-dim">
                {dateClock(r.ts)}
              </td>
              <td className="py-2 pr-3">
                <span className="rounded bg-hairline/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">
                  {r.endpoint}
                </span>
              </td>
              <td className="py-2 pr-3 text-ink">{r.model}</td>
              <td className="py-2 pr-3 text-right text-teal">
                {compact(r.inputTokens)}
                {r.estimated && <span title="estimated">~</span>}
              </td>
              <td className="py-2 pr-3 text-right text-violet">
                {compact(r.outputTokens)}
                {r.estimated && <span title="estimated">~</span>}
              </td>
              <td className="py-2 pr-3 text-right text-dim">
                {latency(r.latencyMs)}
              </td>
              <td
                className={`py-2 text-right ${r.status === "ok" ? "text-dim" : "text-red"}`}
              >
                {r.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
