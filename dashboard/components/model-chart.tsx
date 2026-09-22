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
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#1e1e22" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="model"
          tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
          tickLine={false}
          axisLine={{ stroke: "#1e1e22" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={52}
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
          formatter={(value) => compact(Number(value ?? 0))}
        />
        <Bar dataKey="input" stackId="t" fill="#06b6d4" radius={[0, 0, 0, 0]} />
        <Bar dataKey="output" stackId="t" fill="#a78bfa" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
