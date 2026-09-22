"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/types";
import { compact, dayTime } from "@/lib/format";

export default function TokensChart({
  series,
  bucketMs,
}: {
  series: SeriesPoint[];
  bucketMs: number;
}) {
  const data = series.map((p) => ({
    ...p,
    label: dayTime(p.t, bucketMs),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e1e22" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#1e1e22" }}
          minTickGap={48}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11, fontFamily: "monospace" }}
          tickFormatter={compact}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "#1c1c21",
            border: "none",
            borderRadius: 10,
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
            fontFamily: "monospace",
            fontSize: 12,
            color: "#fafafa",
          }}
          labelStyle={{ color: "#71717a" }}
          cursor={{ fill: "rgba(255,255,255,0.02)" }}
          formatter={(value, name) => [
            compact(Number(value ?? 0)),
            name === "inputTokens" ? "input" : "output",
          ]}
        />
        <Bar dataKey="inputTokens" stackId="t" fill="#06b6d4" name="inputTokens" />
        <Bar
          dataKey="outputTokens"
          stackId="t"
          fill="#a78bfa"
          name="outputTokens"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
