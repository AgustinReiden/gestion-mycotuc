import { clsx, type ClassValue } from "clsx";
import { format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

/**
 * Convierte "yyyy-mm-dd" (o un timestamp ISO que arranca con esa fecha) en un
 * Date local a medianoche. Se usa el día calendario del texto, sin pasar por
 * UTC, para que "2026-11-03" nunca se muestre como 2 de noviembre.
 */
export function parseCalendarDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = DATE_PREFIX.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsed;
}

/** Fecha de hoy en zona local como "yyyy-mm-dd" (no usa UTC, así no se corre de noche). */
export function todayISO(now = new Date()) {
  return format(now, "yyyy-MM-dd");
}

export function formatDate(value: string | null | undefined, dateFormat = "dd MMM yyyy") {
  const parsedDate = parseCalendarDate(value) ?? (value ? parseISO(value) : null);

  if (!parsedDate || !isValid(parsedDate)) {
    return "-";
  }

  return format(parsedDate, dateFormat, { locale: es });
}

export function formatMonthLabel(date = new Date()) {
  return format(date, "MMMM yyyy", { locale: es });
}

export function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function sumBy<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}
