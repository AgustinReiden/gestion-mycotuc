"use client";

import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  asChild?: boolean;
};

export function Button({
  className,
  variant = "primary",
  busy = false,
  asChild = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" && "bg-[var(--accent)] text-white shadow-[0_4px_14px_0_rgba(59,95,66,0.39)] hover:shadow-[0_6px_20px_rgba(59,95,66,0.23)] hover:bg-[var(--accent-strong)]",
    variant === "secondary" && "glass-panel border border-[var(--line)] text-[var(--foreground)] hover:bg-white/90 hover:shadow-sm",
    variant === "ghost" && "text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--foreground)]",
    variant === "danger" && "bg-[var(--danger)] text-white shadow-[0_4px_14px_0_rgba(165,75,61,0.39)] hover:shadow-[0_6px_20px_rgba(165,75,61,0.23)] hover:bg-[#8e3c30]",
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
      {...props}
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
