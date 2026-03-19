import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[24px] border border-dashed border-[var(--line)] bg-white/60 px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dce8db] text-[#15553e]">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
