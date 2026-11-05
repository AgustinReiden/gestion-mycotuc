import type { CategoryScaleRecord, ProductRecord } from "@/lib/domain";
import { roundMoney, type PricedLineInput } from "./pricing";

export type ScaledLine = {
  lineTotal: number;
  scaleId: string;
  tierMinQty: number;
};

type ScaleProduct = Pick<ProductRecord, "id" | "salePrice" | "category">;

type EligibleLine = {
  index: number;
  productId: string;
  quantity: number;
  salePrice: number;
};

function toQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Cantidades con 2 decimales como en la base (numeric): evita que 0.6 + 0.3 + 0.1 sea 0.9999999999999999. */
function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Misma regla que `public.price_category_scales` en la base. Devuelve, por indice de renglon,
 * el total que fija una escala por categoria; los renglones sin escala no aparecen.
 *
 * q = unidades de renglones de producto directo (no combo) de la categoria, sin excluidos.
 * Escalon = el de mayor minQty <= q. "unit": cada unidad al precio del escalon. "pack": las
 * minQty unidades de mayor precio normal se cobran en total al precio del escalon (repartido
 * proporcional al precio normal) y el resto va a su precio normal.
 */
export function priceCategoryScales(
  lines: PricedLineInput[],
  products: ScaleProduct[],
  scales: CategoryScaleRecord[],
): Map<number, ScaledLine> {
  const result = new Map<number, ScaledLine>();
  const productById = new Map(products.map((product) => [product.id, product]));

  scales.forEach((scale) => {
    if (!scale.isActive || !scale.categoryIsActive) {
      return;
    }

    const excluded = new Set(scale.excludedProductIds);
    const eligible: EligibleLine[] = [];

    lines.forEach((line, index) => {
      const quantity = toQuantity(line.quantity);
      const product = line.productId ? productById.get(line.productId) : undefined;

      if (!product || line.bundleId || quantity === 0) {
        return;
      }

      if (product.category !== scale.categoryName || excluded.has(product.id)) {
        return;
      }

      eligible.push({ index, productId: product.id, quantity, salePrice: product.salePrice });
    });

    const totalQuantity = roundQuantity(eligible.reduce((total, line) => total + line.quantity, 0));
    const tier = [...scale.tiers]
      .filter((entry) => entry.minQty <= totalQuantity)
      .sort((left, right) => right.minQty - left.minQty)[0];

    if (!tier) {
      return;
    }

    if (tier.mode === "unit") {
      eligible.forEach((line) => {
        result.set(line.index, {
          lineTotal: roundMoney(line.quantity * tier.price),
          scaleId: scale.id,
          tierMinQty: tier.minQty,
        });
      });
      return;
    }

    const ordered = [...eligible].sort(
      (left, right) =>
        right.salePrice - left.salePrice ||
        (left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0) ||
        left.index - right.index,
    );

    let before = 0;
    const split = ordered.map((line) => {
      const packQuantity = roundQuantity(Math.max(Math.min(line.quantity, tier.minQty - before), 0));
      before = roundQuantity(before + line.quantity);
      return { line, packQuantity };
    });

    const inPack = split.filter((entry) => entry.packQuantity > 0);
    const weightSum = inPack.reduce((total, entry) => total + entry.line.salePrice * entry.packQuantity, 0);
    const packQuantitySum = inPack.reduce((total, entry) => total + entry.packQuantity, 0);
    const lastPackIndex = inPack.length - 1;
    let allocated = 0;

    split.forEach((entry) => {
      let share = 0;
      const position = inPack.indexOf(entry);

      if (position === lastPackIndex) {
        share = roundMoney(tier.price - allocated);
      } else if (position >= 0) {
        share = roundMoney(
          weightSum > 0
            ? (tier.price * entry.line.salePrice * entry.packQuantity) / weightSum
            : (tier.price * entry.packQuantity) / packQuantitySum,
        );
        allocated += share;
      }

      const leftover = roundMoney((entry.line.quantity - entry.packQuantity) * entry.line.salePrice);

      result.set(entry.line.index, {
        lineTotal: roundMoney(share + leftover),
        scaleId: scale.id,
        tierMinQty: tier.minQty,
      });
    });
  });

  return result;
}
