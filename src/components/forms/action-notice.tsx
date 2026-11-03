import { cn } from "@/lib/utils";

type ActionNoticeProps = {
  tone: "success" | "error" | "warning";
  message: string;
};

export function ActionNotice({ tone, message }: ActionNoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "rounded-[var(--radius-control)] border-l-4 px-3.5 py-3 text-[15px] leading-snug",
        tone === "success" && "border-[var(--moss)] bg-[var(--moss-soft)] text-[#1f4a2f]",
        tone === "error" && "border-[var(--danger)] bg-[var(--danger-soft)] text-[#7a1a14]",
        tone === "warning" && "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber-ink)]",
      )}
    >
      {message}
    </div>
  );
}
