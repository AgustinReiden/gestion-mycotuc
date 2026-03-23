"use client";

import dynamic from "next/dynamic";

const DonutChart = dynamic(
  () => import("@/components/app/charts/donut-chart").then((mod) => mod.DonutChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[200px] w-full items-center justify-center rounded-[24px] border border-[var(--line)] bg-white/50 text-sm text-[var(--muted)]">
        Cargando grafico...
      </div>
    ),
  },
);

type LazyDonutChartProps = {
  data: { name: string; percentage: number }[];
  colors: string[];
};

export function LazyDonutChart(props: LazyDonutChartProps) {
  if (!props.data || props.data.length === 0) {
    return (
      <div className="flex h-[200px] w-full items-center justify-center rounded-[24px] border border-[var(--line)] bg-white/50 text-sm text-[var(--muted)]">
        Sin datos suficientes
      </div>
    );
  }

  return <DonutChart {...props} />;
}
