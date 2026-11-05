import { describe, expect, it } from "vitest";
import { priceCategoryScales } from "../src/lib/category-scales";
import type { CategoryScaleRecord } from "../src/lib/domain";

const products = [
  { id: "a", category: "Extractos", salePrice: 25000 },
  { id: "b", category: "Extractos", salePrice: 22000 },
  { id: "c", category: "Extractos", salePrice: 20000 },
  { id: "d", category: "Extractos", salePrice: 20000 },
  { id: "sal", category: "Sales", salePrice: 5000 },
];

function makeScale(overrides: Partial<CategoryScaleRecord> = {}): CategoryScaleRecord {
  return {
    id: "scale-1",
    categoryId: "cat-1",
    categoryName: "Extractos",
    categoryIsActive: true,
    isActive: true,
    excludedProductIds: [],
    tiers: [
      { id: "t3", minQty: 3, price: 65000, mode: "pack" },
      { id: "t4", minQty: 4, price: 80000, mode: "pack" },
      { id: "t5", minQty: 5, price: 15000, mode: "unit" },
    ],
    ...overrides,
  };
}

function line(productId: string, quantity: number) {
  return { productId, quantity };
}

function sum(result: ReturnType<typeof priceCategoryScales>) {
  return [...result.values()].reduce((total, entry) => total + entry.lineTotal, 0);
}

describe("priceCategoryScales", () => {
  it("no aplica nada bajo el primer escalon", () => {
    const result = priceCategoryScales([line("a", 1), line("b", 1)], products, [makeScale()]);
    expect(result.size).toBe(0);
  });

  it("3 productos distintos suman el total del pack de 3", () => {
    const result = priceCategoryScales([line("a", 1), line("b", 1), line("c", 1)], products, [makeScale()]);
    expect(result.size).toBe(3);
    expect(sum(result)).toBe(65000);
    expect(result.get(0)).toMatchObject({ scaleId: "scale-1", tierMinQty: 3 });
  });

  it("4 productos distintos suman el total del pack de 4", () => {
    const result = priceCategoryScales(
      [line("a", 1), line("b", 1), line("c", 1), line("d", 1)],
      products,
      [makeScale()],
    );
    expect(sum(result)).toBe(80000);
    expect(result.get(2)?.tierMinQty).toBe(4);
  });

  it("6 unidades cobran el precio por unidad del escalon de 5 o mas", () => {
    const result = priceCategoryScales([line("a", 2), line("b", 2), line("c", 2)], products, [makeScale()]);
    expect(sum(result)).toBe(90000);
  });

  it("mas unidades que el ultimo escalon siguen en el ultimo escalon", () => {
    expect(sum(priceCategoryScales([line("a", 12)], products, [makeScale()]))).toBe(180000);
  });

  it("el mismo producto en dos renglones con decimales suma como 3 unidades", () => {
    const result = priceCategoryScales([line("a", 0.5), line("a", 2.5)], products, [makeScale()]);
    expect(result.size).toBe(2);
    expect(sum(result)).toBe(65000);
  });

  it("las unidades de un combo no cuentan para la escala", () => {
    const result = priceCategoryScales(
      [line("a", 1), line("b", 1), { bundleId: "combo", quantity: 1 }],
      products,
      [makeScale()],
    );
    expect(result.size).toBe(0);
  });

  it("un producto de otra categoria no cuenta ni se toca", () => {
    const result = priceCategoryScales(
      [line("a", 1), line("b", 1), line("c", 1), line("sal", 1)],
      products,
      [makeScale()],
    );
    expect(result.size).toBe(3);
    expect(result.has(3)).toBe(false);
    expect(sum(result)).toBe(65000);
  });

  it("con un solo escalon de pack, el pack toma las unidades mas caras y las sobrantes van al precio normal", () => {
    const scale = makeScale({ tiers: [{ id: "t3", minQty: 3, price: 65000, mode: "pack" }] });
    // pack: a, a, b = 65000; sobrante: c a su precio normal (20000)
    const result = priceCategoryScales([line("a", 2), line("b", 1), line("c", 1)], products, [scale]);
    expect(sum(result)).toBe(85000);
  });

  it("un producto excluido no cuenta para la escala", () => {
    const scale = makeScale({
      excludedProductIds: ["d"],
      tiers: [{ id: "t3", minQty: 3, price: 65000, mode: "pack" }],
    });
    const full = priceCategoryScales([line("a", 1), line("b", 1), line("c", 1), line("d", 1)], products, [scale]);
    expect(full.size).toBe(3);
    expect(full.has(3)).toBe(false);
    expect(sum(full)).toBe(65000);

    const short = priceCategoryScales([line("a", 1), line("b", 1), line("d", 1)], products, [scale]);
    expect(short.size).toBe(0);
  });

  it("ignora la escala desactivada o con la categoria desactivada", () => {
    const lines = [line("a", 1), line("b", 1), line("c", 1)];
    expect(priceCategoryScales(lines, products, [makeScale({ isActive: false })]).size).toBe(0);
    expect(priceCategoryScales(lines, products, [makeScale({ categoryIsActive: false })]).size).toBe(0);
  });

  it("el reparto del pack es exacto al centavo", () => {
    const scale = makeScale({ tiers: [{ id: "t3", minQty: 3, price: 100, mode: "pack" }] });
    const result = priceCategoryScales([line("a", 1), line("b", 1), line("c", 1)], products, [scale]);
    expect(Math.round(sum(result) * 100)).toBe(10000);
  });
});
