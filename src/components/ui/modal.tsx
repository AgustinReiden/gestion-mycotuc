"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
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
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const firstControl = panel?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );

      firstControl?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[#122116]/60">
      <div
        className="flex min-h-full items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-8"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "glass-panel shadow-soft w-full overflow-hidden rounded-t-[30px] border border-white/70 sm:rounded-[30px]",
            size === "md" && "max-w-xl",
            size === "lg" && "max-w-3xl",
            size === "xl" && "max-w-5xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div className="space-y-1">
              <h3 id={titleId} className="text-xl font-semibold text-[var(--foreground)] sm:text-2xl">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="text-sm text-[var(--muted)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--muted)] transition hover:bg-white/80 hover:text-[var(--foreground)]"
              aria-label="Cerrar modal"
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
    </div>,
    document.body,
  );
}
