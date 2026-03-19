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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border shadow-sm transition-colors",
        tone === "neutral" && "bg-[#f4f2e9] text-[#5c6358] border-[#e8e6d2]",
        tone === "success" && "bg-[#eaf4eb] text-[#2c5f43] border-[#d4e8d8]",
        tone === "warning" && "bg-[#faedd4] text-[#8e6523] border-[#f2dfb8]",
        tone === "danger" && "bg-[#f8e4e0] text-[#914032] border-[#f0c9c2]",
        tone === "accent" && "bg-[#ebf2ec] text-[#2f5c43] border-[#d8e6da]",
        className,
      )}
    >
      {children}
    </span>
  );
}
