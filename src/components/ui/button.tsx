"use client";

import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  busy?: boolean;
  asChild?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  busy = false,
  asChild = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-[background-color,border-color,color,transform] duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    size === "md" && "min-h-11 px-4 text-[15px]",
    size === "lg" && "min-h-13 px-5 text-base",
    variant === "primary" && "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]",
    variant === "secondary" &&
      "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]",
    variant === "ghost" &&
      "text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
    variant === "danger" && "bg-[var(--danger)] text-white hover:bg-[#931d17]",
    className,
  );

  if (asChild && isValidElement(children)) {
    const element = children as ReactElement<{ className?: string }>;
    return cloneElement(element, {
      className: cn(classes, element.props.className),
    });
  }

  return (
    <button
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
