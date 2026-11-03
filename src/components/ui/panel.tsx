import { cn } from "@/lib/utils";

type PanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
