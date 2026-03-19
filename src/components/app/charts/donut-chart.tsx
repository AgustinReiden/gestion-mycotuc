"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type DonutChartProps = {
  data: { name: string; percentage: number }[];
  colors: string[];
};

export function DonutChart({ data, colors }: DonutChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
        Sin datos suficientes
      </div>
    );
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={3}
            dataKey="percentage"
            stroke="none"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              borderRadius: "16px",
              border: "1px solid var(--line)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
            itemStyle={{ color: "var(--foreground)", fontWeight: 500 }}
            formatter={(value) => [`${value ?? 0}%`, "Porcentaje"]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
