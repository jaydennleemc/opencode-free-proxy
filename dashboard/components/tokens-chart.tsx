"use client";

import {
  Area,
  AreaChart,
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
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </linearGradient>
        </defs>
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
            border: "1px solid #1e2632",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
          }}
          labelStyle={{ color: "#6b7686" }}
          formatter={(value, name) => [
            compact(Number(value ?? 0)),
            name === "inputTokens" ? "input" : "output",
          ]}
        />
        <Area
          type="monotone"
          dataKey="inputTokens"
          stroke="#2dd4bf"
          strokeWidth={1.5}
          fill="url(#gIn)"
          name="inputTokens"
        />
        <Area
          type="monotone"
          dataKey="outputTokens"
          stroke="#a78bfa"
          strokeWidth={1.5}
          fill="url(#gOut)"
          name="outputTokens"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
