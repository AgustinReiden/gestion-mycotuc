"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
};

/**
 * En el celular es una hoja a pantalla completa con encabezado fijo; en escritorio, un diálogo
 * centrado. El cuerpo es el contenedor con scroll, así `.sheet-actions` queda pegado abajo.
 */
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
  // El portal solo existe en el navegador: hasta hidratar se renderiza igual que en el servidor.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // En pantallas táctiles no se enfoca el primer campo: abriría el teclado y taparía la hoja.
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;

      if (isTouch) {
        panel?.focus();
        return;
      }

      const firstControl = panel?.querySelector<HTMLElement>(
        'input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
      );

      (firstControl ?? panel)?.focus();
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

  if (!open || !hydrated) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-[rgba(30,25,21,0.45)]">
      <div
        className="flex h-full items-stretch justify-center sm:items-center sm:px-4 sm:py-8"
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
            "animate-sheet flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[var(--surface)] outline-none sm:h-auto sm:max-h-[min(90dvh,960px)] sm:rounded-[20px] sm:border sm:border-[var(--line)] sm:shadow-[0_24px_60px_rgba(30,25,21,0.18)]",
            size === "md" && "sm:max-w-xl",
            size === "lg" && "sm:max-w-3xl",
            size === "xl" && "sm:max-w-5xl",
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:px-5 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ink-2)] transition hover:bg-[var(--surface-2)] sm:order-last sm:ml-auto"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h3 id={titleId} className="truncate text-lg font-semibold text-[var(--foreground)] sm:text-xl">
                {title}
              </h3>
              {description ? (
                <p id={descriptionId} className="truncate text-[13px] text-[var(--muted)] sm:whitespace-normal sm:text-sm">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-5 sm:pt-5 [&:not(:has(.sheet-actions))]:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:[&:not(:has(.sheet-actions))]:pb-5">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-[var(--line)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:py-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
