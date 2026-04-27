export function toInputValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function toNumberValue(value: string) {
  return value === "" ? "" : Number(value);
}

export function toNullableNumberValue(value: string) {
  return value === "" ? null : Number(value);
}
