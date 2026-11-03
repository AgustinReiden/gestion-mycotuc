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
    <Panel className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink-2)]">
        <Icon
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0",
            tone === "accent" && "text-[var(--moss)]",
            tone === "danger" && "text-[var(--danger)]",
            tone === "info" && "text-[var(--ink-2)]",
            tone === "warning" && "text-[var(--amber-ink)]",
          )}
        />
        <span className="truncate">{label}</span>
      </div>
      <p className="font-[family-name:var(--font-heading)] text-[28px] font-semibold leading-tight tracking-tight text-[var(--foreground)] tabular-nums sm:text-3xl">
        {value}
      </p>
      <p className="text-[13px] leading-snug text-[var(--muted)]">{helper}</p>
    </Panel>
  );
}
