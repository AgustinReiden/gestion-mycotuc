import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/* 16 px para que iOS no haga zoom al enfocar; 48 px de alto para el pulgar. */
const CONTROL_CLASSES =
  "min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-base text-[var(--foreground)] placeholder:text-[#958d84] transition-colors focus:border-[var(--foreground)] focus:ring-2 focus:ring-[var(--amber-soft)] disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)] read-only:bg-[var(--surface-2)] aria-[invalid=true]:border-[var(--danger)]";

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

  const componentType = child.type as { displayName?: string; name?: string };
  const componentName = componentType.displayName ?? componentType.name ?? "";

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
    <div className="grid gap-1.5">
      {isFieldControl(children) ? (
        <label id={labelId} htmlFor={(children.props.id as string | undefined) ?? controlId} className="text-sm font-semibold text-[var(--ink-2)]">
          {label}
        </label>
      ) : (
        <span id={labelId} className="text-sm font-semibold text-[var(--ink-2)]">
          {label}
        </span>
      )}
      {content}
      {error ? <span id={errorId} className="text-sm font-medium text-[var(--danger)]">{error}</span> : null}
      {!error && hint ? <span id={hintId} className="text-[13px] leading-snug text-[var(--muted)]">{hint}</span> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={cn(
        CONTROL_CLASSES,
        props.className,
      )}
    />
  );
  },
);
TextInput.displayName = "TextInput";

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput(props, ref) {
  return (
    <select
      {...props}
      ref={ref}
      className={cn(
        CONTROL_CLASSES, "appearance-none bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10 [background-image:var(--select-chevron)]",
        props.className,
      )}
    />
  );
  },
);
SelectInput.displayName = "SelectInput";

export const TextareaInput = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextareaInput(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={cn(
        CONTROL_CLASSES,
        props.className,
      )}
    />
  );
});
TextareaInput.displayName = "TextareaInput";
