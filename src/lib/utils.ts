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

export function formatDate(value: string | null | undefined, dateFormat = "dd MMM yyyy") {
  if (!value) {
    return "-";
  }

  const parsedDate = parseISO(value);

  if (!isValid(parsedDate)) {
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
