"use client";

import dynamic from "next/dynamic";

const DonutChart = dynamic(
  () => import("@/components/app/charts/donut-chart").then((mod) => mod.DonutChart),
  { ssr: false },
);

type LazyDonutChartProps = {
  data: { name: string; percentage: number }[];
  colors: string[];
};

export function LazyDonutChart(props: LazyDonutChartProps) {
  return <DonutChart {...props} />;
}
