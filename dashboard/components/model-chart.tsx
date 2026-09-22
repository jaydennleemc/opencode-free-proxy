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
import type { ModelRow } from "@/lib/types";
import { compact } from "@/lib/format";

export default function ModelChart({ rows }: { rows: ModelRow[] }) {
  const data = rows.map((r) => ({
    model: r.model.replace(/-free$/, ""),
    input: r.inputTokens,
    output: r.outputTokens,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e2632" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="model"
          tick={{ fill: "#6b7686", fontSize: 10, fontFamily: "monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#1e2632" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={52}
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
          formatter={(value) => compact(Number(value ?? 0))}
        />
        <Bar dataKey="input" stackId="t" fill="#2dd4bf" radius={[0, 0, 0, 0]} />
        <Bar dataKey="output" stackId="t" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
