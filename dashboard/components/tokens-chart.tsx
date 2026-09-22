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
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e2632" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7686", fontSize: 11, fontFamily: "monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#1e2632" }}
          minTickGap={48}
        />
        <YAxis
          tick={{ fill: "#6b7686", fontSize: 11, fontFamily: "monospace" }}
          tickFormatter={compact}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: "#12161d",
            border: "none",
            borderRadius: 8,
            boxShadow:
              "0 0 0 1px oklch(1 0 0 / 0.1), 0 8px 24px -4px oklch(0 0 0 / 0.5)",
            fontFamily: "monospace",
            fontSize: 12,
          }}
          labelStyle={{ color: "#6b7686" }}
          formatter={(value, name) => [
            compact(Number(value ?? 0)),
            name === "inputTokens" ? "input" : "output",
          ]}
        />
        <Bar dataKey="inputTokens" stackId="t" fill="#2dd4bf" name="inputTokens" />
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
