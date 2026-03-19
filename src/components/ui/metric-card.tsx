import type { LucideIcon } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "accent" | "danger" | "info" | "warning";
};

export function MetricCard({ label, value, helper, icon: Icon, tone = "accent" }: MetricCardProps) {
  return (
    <Panel className="p-0">
      <div className="flex items-start justify-between p-5">
        <div className="space-y-2">
          <p className="text-sm text-[var(--muted)]">{label}</p>
          <p className="text-3xl font-semibold text-[var(--foreground)]">{value}</p>
          <p className="text-sm text-[var(--muted)]">{helper}</p>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border",
            tone === "accent" && "bg-[#ebf2ec] text-[#2f5c43] border-[#d8e6da]",
            tone === "danger" && "bg-[#faebe8] text-[#a54b3d] border-[#f0d4cf]",
            tone === "info" && "bg-[#e8f0f4] text-[#35627a] border-[#d2e4ed]",
            tone === "warning" && "bg-[#fcf0d9] text-[#b77f28] border-[#f5dfb8]",
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Panel>
  );
}
