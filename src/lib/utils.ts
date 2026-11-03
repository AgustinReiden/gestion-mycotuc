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

/**
 * Zona horaria del negocio. El servidor corre en UTC: "hoy" y "este mes" se calculan siempre
 * en hora argentina, así después de las 21:00 no se pasa al día (o al mes) siguiente.
 */
export const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día calendario ("yyyy-mm-dd") de un instante, en hora argentina. */
export function toBusinessDateISO(instant: Date) {
  const parts = businessDateFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Fecha de hoy en hora argentina como "yyyy-mm-dd" (no depende de la zona del servidor). */
export function todayISO(now = new Date()) {
  return toBusinessDateISO(now);
}

/** Suma (o resta) días a una fecha "yyyy-mm-dd" sin pasar por zonas horarias. */
export function addCalendarDays(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Mes en curso en hora argentina: "yyyy-mm" y sus días primero y último como "yyyy-mm-dd". */
export function getBusinessMonth(now = new Date()) {
  const today = toBusinessDateISO(now);
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthKey = today.slice(0, 7);

  return {
    month: monthKey,
    today,
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Fecha de un instante real (timestamptz, p. ej. voided_at) vista en hora argentina.
 * A diferencia de formatDate, no toma el día del texto UTC: 23:30 del 5/11 en Argentina
 * se guarda como 02:30Z del 6/11 y se muestra 05/11.
 */
export function formatInstantDate(value: string | null | undefined, dateFormat = "dd/MM/yyyy") {
  if (!value) {
    return "-";
  }

  const instant = new Date(value);

  if (Number.isNaN(instant.getTime())) {
    return "-";
  }

  return formatDate(toBusinessDateISO(instant), dateFormat);
}

export function formatDate(value: string | null | undefined, dateFormat = "dd MMM yyyy") {
  const parsedDate = parseCalendarDate(value) ?? (value ? parseISO(value) : null);

  if (!parsedDate || !isValid(parsedDate)) {
    return "-";
  }

  return format(parsedDate, dateFormat, { locale: es });
}

/** "noviembre 2026" del mes en curso en hora argentina. */
export function formatMonthLabel(date = new Date()) {
  return formatDate(getBusinessMonth(date).start, "MMMM yyyy");
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
