import type { BundleRecord, PriceTierRecord } from "@/lib/domain";

export type PricedLineInput = {
  productId?: string | null;
  bundleId?: string | null;
  quantity?: unknown;
};

export type ListPriceResult = {
  unitPrice: number;
  tier: Pick<PriceTierRecord, "minQty" | "unitPrice"> | null;
};

function toQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Misma regla que el servidor: la escala mas alta con min_qty <= cantidad total
 * del producto en la venta; si no hay ninguna, el precio base del producto.
 */
export function resolveProductListPrice(
  basePrice: number,
  tiers: Pick<PriceTierRecord, "minQty" | "unitPrice">[],
  totalQuantity: number,
): ListPriceResult {
  const applicable = tiers
    .filter((tier) => tier.minQty <= totalQuantity)
    .sort((left, right) => right.minQty - left.minQty)[0];

  return applicable
    ? { unitPrice: applicable.unitPrice, tier: applicable }
    : { unitPrice: basePrice, tier: null };
}

/** Cantidad total por producto sumando solo lineas directas (los combos no cuentan para escalas). */
export function getDirectProductQuantities(lines: PricedLineInput[]) {
  const totals = new Map<string, number>();

  lines.forEach((line) => {
    if (!line.productId || line.bundleId) {
      return;
    }

    totals.set(line.productId, (totals.get(line.productId) ?? 0) + toQuantity(line.quantity));
  });

  return totals;
}

/** Stock requerido por producto: lineas directas mas componentes de combos. */
export function getRequiredStock(lines: PricedLineInput[], bundles: BundleRecord[]) {
  const totals = getDirectProductQuantities(lines);

  lines.forEach((line) => {
    if (!line.bundleId) {
      return;
    }

    const bundle = bundles.find((entry) => entry.id === line.bundleId);
    const quantity = toQuantity(line.quantity);

    bundle?.items.forEach((item) => {
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity * quantity);
    });
  });

  return totals;
}

export function groupTiersByProduct(tiers: PriceTierRecord[]) {
  const grouped = new Map<string, PriceTierRecord[]>();

  tiers.forEach((tier) => {
    grouped.set(tier.productId, [...(grouped.get(tier.productId) ?? []), tier]);
  });

  grouped.forEach((list, productId) => {
    grouped.set(
      productId,
      [...list].sort((left, right) => left.minQty - right.minQty),
    );
  });

  return grouped;
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
