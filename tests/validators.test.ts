import { describe, expect, it } from "vitest";
import {
  getDirectProductQuantities,
  getRequiredStock,
  resolveProductListPrice,
} from "../src/lib/pricing";
import {
  bundleFormSchema,
  paymentStatusUpdateSchema,
  priceTiersFormSchema,
  productionBatchFormSchema,
  purchaseFormSchema,
  reversalSchema,
  saleOrderFormSchema,
  stockAdjustmentSchema,
} from "../src/lib/validators";

const ids = {
  sale: "00000000-0000-4000-8000-000000000001",
  contact: "00000000-0000-4000-8000-000000000002",
  channel: "00000000-0000-4000-8000-000000000003",
  product: "00000000-0000-4000-8000-000000000004",
  otherProduct: "00000000-0000-4000-8000-000000000005",
  supplier: "00000000-0000-4000-8000-000000000006",
  supply: "00000000-0000-4000-8000-000000000007",
  bundle: "00000000-0000-4000-8000-000000000008",
};

const baseSale = {
  customerMode: "existing",
  contactId: ids.contact,
  customerName: "Cliente Test",
  customerPhone: "",
  customerEmail: "",
  saleDate: "2026-04-27",
  channelId: ids.channel,
  paymentStatus: "pending",
  paymentMethod: "",
  paidAt: "",
  notes: "",
  items: [{ productId: ids.product, quantity: 1, unitPrice: 100 }],
};

describe("sale order validation", () => {
  it("rejects pending sales with payment data", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      paymentMethod: "Transferencia",
    });

    expect(result.success).toBe(false);
  });

  it("requires method and date for paid sales", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      paymentStatus: "paid",
      paymentMethod: "Transferencia",
      paidAt: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero unit prices", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      items: [{ productId: ids.product, quantity: 1, unitPrice: 0 }],
    });

    expect(result.success).toBe(false);
  });
});

describe("purchase validation", () => {
  it("rejects zero unit costs", () => {
    const result = purchaseFormSchema.safeParse({
      supplierId: ids.supplier,
      purchaseDate: "2026-04-27",
      notes: "",
      items: [{ supplyId: ids.supply, quantity: 1, unitCost: 0 }],
    });

    expect(result.success).toBe(false);
  });
});

describe("production batch validation", () => {
  it("requires closing data, inputs and target output before completion", () => {
    const result = productionBatchFormSchema.safeParse({
      productId: ids.product,
      status: "completed",
      startedAt: "2026-04-27",
      completedAt: "",
      expectedQty: null,
      actualQty: null,
      notes: "",
      inputs: [],
      outputs: [{ productId: ids.otherProduct, quantity: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("completedAt");
      expect(paths).toContain("inputs");
      expect(paths).toContain("outputs");
    }
  });

  it("accepts a complete batch with consumed supplies and target output", () => {
    const result = productionBatchFormSchema.safeParse({
      productId: ids.product,
      status: "completed",
      startedAt: "2026-04-27",
      completedAt: "2026-04-28",
      expectedQty: 10,
      actualQty: 8,
      notes: "",
      inputs: [{ supplyId: ids.supply, quantity: 2 }],
      outputs: [{ productId: ids.product, quantity: 8 }],
    });

    expect(result.success).toBe(true);
  });
});

describe("stock, payment and reversal validation", () => {
  it("rejects zero stock adjustments", () => {
    const result = stockAdjustmentSchema.safeParse({
      entityType: "product",
      entityId: ids.product,
      quantity: 0,
      notes: "",
      movementDate: "2026-04-27",
    });

    expect(result.success).toBe(false);
  });

  it("rejects paid payment status without collection details", () => {
    const result = paymentStatusUpdateSchema.safeParse({
      saleOrderId: ids.sale,
      paymentStatus: "paid",
      paymentMethod: "",
      paidAt: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects reversals and adjustments without a reason", () => {
    expect(reversalSchema.safeParse({ id: ids.sale, reason: "" }).success).toBe(false);
    expect(
      stockAdjustmentSchema.safeParse({
        entityType: "product",
        entityId: ids.product,
        quantity: 5,
        notes: "",
        movementDate: "2026-04-27",
      }).success,
    ).toBe(false);
  });

  it("accepts reversal payloads with a reason", () => {
    const result = reversalSchema.safeParse({
      id: ids.sale,
      reason: "Error de carga",
    });

    expect(result.success).toBe(true);
  });
});

describe("sale line validation (product or bundle)", () => {
  it("accepts product lines and bundle lines without unit price", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      items: [
        { productId: ids.product, bundleId: "", quantity: 2 },
        { productId: "", bundleId: ids.bundle, quantity: 1, unitPrice: "" },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).toMatchObject({ productId: ids.product, bundleId: undefined });
      expect(result.data.items[1]).toMatchObject({ productId: undefined, bundleId: ids.bundle });
      expect(result.data.items[1].unitPrice).toBeUndefined();
    }
  });

  it("rejects lines with both product and bundle", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      items: [{ productId: ids.product, bundleId: ids.bundle, quantity: 1, unitPrice: 100 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects lines without product or bundle", () => {
    const result = saleOrderFormSchema.safeParse({
      ...baseSale,
      items: [{ productId: "", bundleId: "", quantity: 1, unitPrice: 100 }],
    });

    expect(result.success).toBe(false);
  });
});

describe("price tier validation", () => {
  it("rejects non positive quantities and prices", () => {
    expect(
      priceTiersFormSchema.safeParse({
        productId: ids.product,
        tiers: [{ minQty: 0, unitPrice: 100 }],
      }).success,
    ).toBe(false);
    expect(
      priceTiersFormSchema.safeParse({
        productId: ids.product,
        tiers: [{ minQty: 10, unitPrice: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicated minimum quantities", () => {
    const result = priceTiersFormSchema.safeParse({
      productId: ids.product,
      tiers: [
        { minQty: 10, unitPrice: 90 },
        { minQty: 10, unitPrice: 80 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("tiers.1.minQty");
    }
  });

  it("sorts tiers by minimum quantity and allows clearing them", () => {
    const result = priceTiersFormSchema.safeParse({
      productId: ids.product,
      tiers: [
        { minQty: 20, unitPrice: 80 },
        { minQty: 5, unitPrice: 95 },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tiers.map((tier) => tier.minQty)).toEqual([5, 20]);
    }
    expect(priceTiersFormSchema.safeParse({ productId: ids.product, tiers: [] }).success).toBe(true);
  });
});

describe("bundle validation", () => {
  const baseBundle = {
    name: "Combo Inmunidad",
    salePrice: 1500,
    notes: "",
    isActive: true,
    items: [
      { productId: ids.product, quantity: 1 },
      { productId: ids.otherProduct, quantity: 2 },
    ],
  };

  it("accepts a valid bundle", () => {
    expect(bundleFormSchema.safeParse(baseBundle).success).toBe(true);
  });

  it("rejects empty bundles, zero price and quantities below one", () => {
    expect(bundleFormSchema.safeParse({ ...baseBundle, items: [] }).success).toBe(false);
    expect(bundleFormSchema.safeParse({ ...baseBundle, salePrice: 0 }).success).toBe(false);
    expect(
      bundleFormSchema.safeParse({
        ...baseBundle,
        items: [{ productId: ids.product, quantity: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects repeated products", () => {
    const result = bundleFormSchema.safeParse({
      ...baseBundle,
      items: [
        { productId: ids.product, quantity: 1 },
        { productId: ids.product, quantity: 2 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("items.1.productId");
    }
  });
});

describe("client pricing rules", () => {
  const tiers = [
    { minQty: 10, unitPrice: 90 },
    { minQty: 20, unitPrice: 80 },
  ];

  it("uses the highest reached tier or the base price", () => {
    expect(resolveProductListPrice(100, tiers, 5)).toEqual({ unitPrice: 100, tier: null });
    expect(resolveProductListPrice(100, tiers, 10).unitPrice).toBe(90);
    expect(resolveProductListPrice(100, tiers, 25)).toEqual({ unitPrice: 80, tier: tiers[1] });
  });

  it("sums direct lines for tiers but ignores bundle components", () => {
    const lines = [
      { productId: ids.product, quantity: 6 },
      { productId: ids.product, quantity: 4 },
      { bundleId: ids.bundle, quantity: 3 },
    ];

    expect(getDirectProductQuantities(lines).get(ids.product)).toBe(10);
  });

  it("adds bundle components to stock requirements", () => {
    const bundles = [
      {
        id: ids.bundle,
        name: "Combo",
        salePrice: 1000,
        notes: null,
        isActive: true,
        createdAt: "",
        items: [
          { id: "i1", productId: ids.product, productName: "A", quantity: 2 },
          { id: "i2", productId: ids.otherProduct, productName: "B", quantity: 1 },
        ],
      },
    ];
    const required = getRequiredStock(
      [
        { productId: ids.product, quantity: 1 },
        { bundleId: ids.bundle, quantity: 3 },
      ],
      bundles,
    );

    expect(required.get(ids.product)).toBe(7);
    expect(required.get(ids.otherProduct)).toBe(3);
  });
});
