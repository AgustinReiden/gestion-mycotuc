import { cn } from "@/lib/utils";

type PanelProps = {
  children: React.ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "glass-panel shadow-soft rounded-[28px] border border-white/70 p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
