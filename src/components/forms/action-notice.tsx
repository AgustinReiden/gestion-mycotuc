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
        "rounded-2xl px-4 py-3 text-sm",
        tone === "success" && "border border-[#cfe5d8] bg-[#eef8f1] text-[#216247]",
        tone === "error" && "border border-[#eccac2] bg-[#fff1ed] text-[#934534]",
        tone === "warning" && "border border-[#ead9b1] bg-[#fff8e8] text-[#8a6118]",
      )}
    >
      {message}
    </div>
  );
}
