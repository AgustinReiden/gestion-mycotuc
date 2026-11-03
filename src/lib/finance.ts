// Imports relativos: vitest corre sin el alias "@/".
import { roundMoney } from "./pricing";
import { formatCurrency } from "./utils";

export type MarginLineInput = {
  quantity: number;
  lineTotal: number;
  unitCost: number | null;
};

export type MarginSummary = {
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
  /** Lineas sin costo (null o 0: producto sin costo promedio al vender): no entran al margen. */
  missingCostLines: number;
};

export type ProductMarginRow = MarginSummary & {
  productName: string;
  quantity: number;
};

type ReceivableSale = {
  totalAmount: number;
  amountPaid: number;
  isVoided: boolean;
};

type MarginSale = {
  isVoided: boolean;
  items: (MarginLineInput & { productName: string })[];
};

/** Saldo pendiente de una venta: total menos lo cobrado, nunca negativo. */
export function getSaleBalance(totalAmount: number, amountPaid: number) {
  return Math.max(roundMoney(totalAmount - amountPaid), 0);
}

/**
 * Regla de cobro parcial (igual que la base): mayor a cero y menor al limite
 * (total de la venta al crearla, saldo pendiente al registrar un cobro nuevo).
 */
export function getPartialAmountError(amount: number | null | undefined, limit: number) {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return "El monto cobrado debe ser mayor a cero.";
  }

  if (amount >= limit) {
    return `El monto cobrado debe ser menor a ${formatCurrency(limit)}. Si cubre todo, usa el estado Pagado.`;
  }

  return null;
}

/**
 * true si la linea tiene costo conocido. Un costo 0 o null es "sin costo": la base guarda NULL
 * cuando el producto no tenia costo promedio, y las ventas viejas pueden tener 0. Contarlas con
 * costo 0 daria un margen falso de 100%.
 */
export function hasKnownCost(unitCost: number | null | undefined): unitCost is number {
  return typeof unitCost === "number" && Number.isFinite(unitCost) && unitCost > 0;
}

/** Costo de una linea: cantidad por costo unitario congelado; null si no hay costo. */
export function getLineCost(quantity: number, unitCost: number | null) {
  return hasKnownCost(unitCost) ? roundMoney(quantity * unitCost) : null;
}

/** Valor del stock a costo promedio (stock negativo no suma valor); null si no hay costo (null o 0). */
export function getStockValue(currentStock: number, avgCost: number | null) {
  return hasKnownCost(avgCost) ? roundMoney(Math.max(currentStock, 0) * avgCost) : null;
}

/** Margen porcentual sobre el precio de venta; null si no hay ingresos. */
export function getMarginPercent(revenue: number, cost: number) {
  return revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;
}

/** Suma ingresos y costos solo de las lineas con costo registrado. */
export function summarizeMargin(lines: MarginLineInput[]): MarginSummary {
  let revenue = 0;
  let cost = 0;
  let missingCostLines = 0;

  lines.forEach((line) => {
    const lineCost = getLineCost(line.quantity, line.unitCost);

    if (lineCost === null) {
      missingCostLines += 1;
      return;
    }

    revenue += line.lineTotal;
    cost += lineCost;
  });

  revenue = roundMoney(revenue);
  cost = roundMoney(cost);

  return {
    revenue,
    cost,
    margin: roundMoney(revenue - cost),
    marginPercent: getMarginPercent(revenue, cost),
    missingCostLines,
  };
}

/** Margen por producto de las ventas no anuladas, ordenado por ingresos. */
export function getMarginByProduct(sales: MarginSale[]): ProductMarginRow[] {
  const grouped = new Map<string, { quantity: number; lines: MarginLineInput[] }>();

  sales
    .filter((sale) => !sale.isVoided)
    .forEach((sale) => {
      sale.items.forEach((item) => {
        const entry = grouped.get(item.productName) ?? { quantity: 0, lines: [] };
        entry.quantity += item.quantity;
        entry.lines.push(item);
        grouped.set(item.productName, entry);
      });
    });

  return Array.from(grouped.entries())
    .map(([productName, entry]) => ({
      productName,
      quantity: entry.quantity,
      ...summarizeMargin(entry.lines),
    }))
    .sort((left, right) => right.revenue - left.revenue);
}

/** Facturado, cobrado y saldo de las ventas no anuladas (los parciales cuentan lo cobrado). */
export function summarizeReceivables(sales: ReceivableSale[]) {
  const active = sales.filter((sale) => !sale.isVoided);
  const billed = roundMoney(active.reduce((sum, sale) => sum + sale.totalAmount, 0));
  const collected = roundMoney(active.reduce((sum, sale) => sum + sale.amountPaid, 0));
  const pending = roundMoney(
    active.reduce((sum, sale) => sum + getSaleBalance(sale.totalAmount, sale.amountPaid), 0),
  );

  return { billed, collected, pending };
}

export function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${(Math.round(value * 10) / 10).toLocaleString("es-AR")}%`;
}
