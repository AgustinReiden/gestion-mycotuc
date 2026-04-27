import type { FieldErrors } from "react-hook-form";

export function toInputValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function toNumberValue(value: string) {
  return value === "" ? "" : Number(value);
}

export function toNullableNumberValue(value: string) {
  return value === "" ? null : Number(value);
}

function findErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const node = error as { message?: unknown; root?: unknown };

  if (typeof node.message === "string" && node.message.trim().length > 0) {
    return node.message;
  }

  const rootMessage = findErrorMessage(node.root);

  if (rootMessage) {
    return rootMessage;
  }

  for (const value of Object.values(error as Record<string, unknown>)) {
    const message = findErrorMessage(value);

    if (message) {
      return message;
    }
  }

  return null;
}

export function getFirstFormError(errors: FieldErrors) {
  return findErrorMessage(errors) ?? "Revisa los campos marcados antes de guardar.";
}
