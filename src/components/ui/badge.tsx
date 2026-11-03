import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  className?: string;
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
        tone === "neutral" && "bg-[var(--surface-2)] text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)]",
        tone === "success" && "bg-[var(--moss-soft)] text-[var(--moss)]",
        tone === "warning" && "bg-[var(--amber-soft)] text-[var(--amber-ink)]",
        tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
        tone === "accent" && "bg-[#ecebe5] text-[var(--foreground)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
