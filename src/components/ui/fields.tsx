import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-[var(--foreground)]">{label}</span>
      {children}
      {error ? <span className="text-sm text-[var(--danger)]">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[#7e867e] focus:border-[#87b89c]",
        props.className,
      )}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--foreground)] focus:border-[#87b89c]",
        props.className,
      )}
    />
  );
}

export function TextareaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[#7e867e] focus:border-[#87b89c]",
        props.className,
      )}
    />
  );
}
