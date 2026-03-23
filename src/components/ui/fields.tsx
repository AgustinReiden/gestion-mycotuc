import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

type AccessibleChildProps = {
  id?: string;
  role?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-labelledby"?: string;
};

function isFieldControl(child: ReactNode): child is ReactElement<AccessibleChildProps> {
  if (!isValidElement<AccessibleChildProps>(child)) {
    return false;
  }

  if (typeof child.type === "string") {
    return child.type === "input" || child.type === "select" || child.type === "textarea";
  }

  const componentName = child.type.name;

  return (
    componentName === "TextInput" ||
    componentName === "SelectInput" ||
    componentName === "TextareaInput"
  );
}

export function Field({ label, error, hint, children }: FieldProps) {
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const controlId = `${fieldId}-control`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errorId : null, !error && hint ? hintId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  let content = children;

  if (isFieldControl(children)) {
    content = cloneElement(children, {
      id: children.props.id ?? controlId,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : children.props["aria-invalid"],
    });
  } else if (isValidElement<AccessibleChildProps>(children)) {
    content = cloneElement(children, {
      id: children.props.id ?? controlId,
      role: children.props.role ?? "group",
      "aria-labelledby": children.props["aria-labelledby"] ?? labelId,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : children.props["aria-invalid"],
    });
  }

  return (
    <div className="space-y-2">
      {isFieldControl(children) ? (
        <label id={labelId} htmlFor={(children.props.id as string | undefined) ?? controlId} className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </label>
      ) : (
        <span id={labelId} className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </span>
      )}
      {content}
      {error ? <span id={errorId} className="text-sm text-[var(--danger)]">{error}</span> : null}
      {!error && hint ? <span id={hintId} className="text-xs text-[var(--muted)]">{hint}</span> : null}
    </div>
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
