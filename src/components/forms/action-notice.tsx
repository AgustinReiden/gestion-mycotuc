import { cn } from "@/lib/utils";

type ActionNoticeProps = {
  tone: "success" | "error";
  message: string;
};

export function ActionNotice({ tone, message }: ActionNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm",
        tone === "success" && "border border-[#cfe5d8] bg-[#eef8f1] text-[#216247]",
        tone === "error" && "border border-[#eccac2] bg-[#fff1ed] text-[#934534]",
      )}
    >
      {message}
    </div>
  );
}
