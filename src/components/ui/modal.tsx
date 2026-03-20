"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
};

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "lg",
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#122116]/60 px-0 py-0 sm:items-center sm:px-4 sm:py-8">
      <div
        className={cn(
          "glass-panel shadow-soft w-full overflow-hidden rounded-t-[30px] border border-white/70 sm:rounded-[30px]",
          size === "md" && "max-w-xl",
          size === "lg" && "max-w-3xl",
          size === "xl" && "max-w-5xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-[var(--foreground)] sm:text-2xl">{title}</h3>
            {description ? <p className="text-sm text-[var(--muted)]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[var(--muted)] transition hover:bg-white/80 hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-4 py-4 sm:max-h-[75vh] sm:px-5 sm:py-5">
          {children}
        </div>
        {footer ? <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">{footer}</div> : null}
      </div>
    </div>
  );
}
