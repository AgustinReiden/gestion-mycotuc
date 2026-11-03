import { describe, expect, it } from "vitest";
import {
  formatPercent,
  getLineCost,
  getMarginByProduct,
  getMarginPercent,
  getPartialAmountError,
  getRefundedAmount,
  getSaleBalance,
  getStockValue,
  PAYMENT_VOID_REASON_BACK_TO_PENDING,
  PAYMENT_VOID_REASON_REFUNDED,
  sumCollectedInRange,
  summarizeMargin,
  summarizeReceivables,
} from "../src/lib/finance";
import {
  getDirectProductQuantities,
  getRequiredStock,
  resolveProductListPrice,
} from "../src/lib/pricing";
import {
  averageCostCorrectionSchema,
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

  it("accepts an optional unit cost only on positive adjustments", () => {
    const base = {
      entityType: "supply",
      entityId: ids.supply,
      notes: "stock inicial",
      movementDate: "2026-11-04",
    };

    const withCost = stockAdjustmentSchema.safeParse({ ...base, quantity: 10, unitCost: 120 });
    expect(withCost.success && withCost.data.unitCost).toBe(120);

    const withoutCost = stockAdjustmentSchema.safeParse({ ...base, quantity: 10, unitCost: "" });
    expect(withoutCost.success && withoutCost.data.unitCost).toBeUndefined();

    expect(stockAdjustmentSchema.safeParse({ ...base, quantity: -2, unitCost: 120 }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ ...base, quantity: 10, unitCost: 0 }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ ...base, quantity: -2, unitCost: "" }).success).toBe(true);
  });

  it("requires a reason to correct the average cost", () => {
    const base = { entityType: "product", entityId: ids.product, avgCost: 50 };

    expect(averageCostCorrectionSchema.safeParse({ ...base, reason: "costo real" }).success).toBe(true);
    expect(averageCostCorrectionSchema.safeParse({ ...base, reason: " " }).success).toBe(false);
    expect(averageCostCorrectionSchema.safeParse({ ...base, avgCost: -1, reason: "costo real" }).success).toBe(false);
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

describe("partial payment validation", () => {
  it("requires the collected amount for partial sales and accepts it", () => {
    const partial = {
      ...baseSale,
      paymentStatus: "partial",
      paymentMethod: "Efectivo",
      paidAt: "2026-04-27",
    };
    const missing = saleOrderFormSchema.safeParse({ ...partial, amountPaid: "" });

    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.path.join("."))).toContain("amountPaid");
    }

    const valid = saleOrderFormSchema.safeParse({ ...partial, amountPaid: "40" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.amountPaid).toBe(40);
    }
  });

  it("rejects zero or negative collected amounts", () => {
    const partial = {
      ...baseSale,
      paymentStatus: "partial",
      paymentMethod: "Efectivo",
      paidAt: "2026-04-27",
    };

    expect(saleOrderFormSchema.safeParse({ ...partial, amountPaid: 0 }).success).toBe(false);
    expect(saleOrderFormSchema.safeParse({ ...partial, amountPaid: -5 }).success).toBe(false);
  });

  it("does not require an amount for pending or paid sales", () => {
    expect(saleOrderFormSchema.safeParse({ ...baseSale, amountPaid: "" }).success).toBe(true);
    expect(
      saleOrderFormSchema.safeParse({
        ...baseSale,
        paymentStatus: "paid",
        paymentMethod: "Transferencia",
        paidAt: "2026-04-27",
      }).success,
    ).toBe(true);
  });

  it("requires a positive amount to register a partial collection", () => {
    const base = {
      saleOrderId: ids.sale,
      paymentStatus: "partial",
      paymentMethod: "Transferencia",
      paidAt: "2026-04-27",
    };

    const missing = paymentStatusUpdateSchema.safeParse({ ...base, amount: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.path.join("."))).toContain("amount");
    }

    expect(paymentStatusUpdateSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);

    const valid = paymentStatusUpdateSchema.safeParse({ ...base, amount: "250.5" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.amount).toBe(250.5);
    }
  });

  it("settles or resets payments without an amount", () => {
    expect(
      paymentStatusUpdateSchema.safeParse({
        saleOrderId: ids.sale,
        paymentStatus: "paid",
        paymentMethod: "Transferencia",
        paidAt: "2026-04-27",
      }).success,
    ).toBe(true);
    expect(
      paymentStatusUpdateSchema.safeParse({
        saleOrderId: ids.sale,
        paymentStatus: "pending",
        paymentMethod: "",
        paidAt: "",
        amount: "",
      }).success,
    ).toBe(true);
  });
});

describe("balances and partial amount limits", () => {
  it("computes the outstanding balance without going negative", () => {
    expect(getSaleBalance(1000, 400)).toBe(600);
    expect(getSaleBalance(1000, 1000)).toBe(0);
    expect(getSaleBalance(100.1, 100.3)).toBe(0);
    expect(getSaleBalance(100.3, 0.1)).toBe(100.2);
  });

  it("accepts only amounts strictly between zero and the limit", () => {
    expect(getPartialAmountError(400, 1000)).toBeNull();
    expect(getPartialAmountError(999.99, 1000)).toBeNull();
    expect(getPartialAmountError(0, 1000)).not.toBeNull();
    expect(getPartialAmountError(undefined, 1000)).not.toBeNull();
    expect(getPartialAmountError(1000, 1000)).not.toBeNull();
    expect(getPartialAmountError(1200, 1000)).not.toBeNull();
  });

  it("sums billed, collected and pending of non voided sales using amount paid", () => {
    const summary = summarizeReceivables([
      { totalAmount: 1000, amountPaid: 1000, isVoided: false },
      { totalAmount: 500, amountPaid: 200, isVoided: false },
      { totalAmount: 300, amountPaid: 0, isVoided: false },
      { totalAmount: 900, amountPaid: 900, isVoided: true },
    ]);

    expect(summary).toEqual({ billed: 1800, collected: 1200, pending: 600 });
  });
});

describe("cash collected in a period", () => {
  const payment = (amount: number, paidAt: string | null, isVoided = false) => ({ amount, paidAt, isVoided });

  it("sums active payments by payment date, regardless of the sale date", () => {
    const total = sumCollectedInRange(
      [
        // venta de octubre cobrada en noviembre: cuenta
        { isVoided: false, payments: [payment(300, "2026-10-28"), payment(700, "2026-11-02")] },
        // cobros en los bordes del mes
        { isVoided: false, payments: [payment(100, "2026-11-01"), payment(50, "2026-11-30"), payment(10, "2026-12-01")] },
        // cobro anulado (venta vuelta a pendiente): no cuenta
        { isVoided: false, payments: [payment(999, "2026-11-10", true), payment(1, "2026-11-11")] },
        // venta anulada con cobros historicos sin marcar: no cuenta
        { isVoided: true, payments: [payment(5000, "2026-11-15")] },
      ],
      "2026-11-01",
      "2026-11-30",
    );

    expect(total).toBe(851);
  });

  it("ignores payments without date", () => {
    expect(sumCollectedInRange([{ isVoided: false, payments: [payment(10, null)] }], "2026-11-01", "2026-11-30")).toBe(0);
  });

  it("reports only what was refunded when voiding the sale", () => {
    expect(
      getRefundedAmount([
        { ...payment(200, "2026-11-01", true), voidReason: PAYMENT_VOID_REASON_REFUNDED },
        { ...payment(300, "2026-11-01", true), voidReason: PAYMENT_VOID_REASON_BACK_TO_PENDING },
        { ...payment(400, "2026-11-01"), voidReason: null },
      ]),
    ).toBe(200);
  });
});

describe("costs and margins", () => {
  it("computes line cost and margin percent", () => {
    expect(getLineCost(3, 12.5)).toBe(37.5);
    expect(getLineCost(3, null)).toBeNull();
    expect(getMarginPercent(200, 50)).toBe(75);
    expect(getMarginPercent(0, 50)).toBeNull();
    expect(getMarginPercent(100, 130)).toBe(-30);
  });

  it("values stock at average cost", () => {
    expect(getStockValue(10, 2.5)).toBe(25);
    expect(getStockValue(-3, 2.5)).toBe(0);
    expect(getStockValue(10, null)).toBeNull();
    expect(getStockValue(10, 0)).toBeNull();
  });

  it("summarizes margin only over lines with a known cost (0 and null are 'sin costo')", () => {
    const summary = summarizeMargin([
      { quantity: 2, lineTotal: 200, unitCost: 40 },
      { quantity: 1, lineTotal: 150, unitCost: 0 },
      { quantity: 5, lineTotal: 500, unitCost: null },
    ]);

    expect(summary).toEqual({
      revenue: 200,
      cost: 80,
      margin: 120,
      marginPercent: 60,
      missingCostLines: 2,
    });
  });

  it("does not report a 100% margin when no line has cost", () => {
    const summary = summarizeMargin([
      { quantity: 12, lineTotal: 216000, unitCost: null },
      { quantity: 1, lineTotal: 1000, unitCost: 0 },
    ]);

    expect(summary.missingCostLines).toBe(2);
    expect(summary.revenue).toBe(0);
    expect(summary.marginPercent).toBeNull();
    expect(getLineCost(12, null)).toBeNull();
    expect(getLineCost(1, 0)).toBeNull();
  });

  it("counts sin-costo lines per product without inflating its margin", () => {
    const [row] = getMarginByProduct([
      {
        isVoided: false,
        items: [
          { productName: "Reishi", quantity: 2, lineTotal: 200, unitCost: 50 },
          { productName: "Reishi", quantity: 1, lineTotal: 100, unitCost: null },
        ],
      },
    ]);

    expect(row.quantity).toBe(3);
    expect(row.revenue).toBe(200);
    expect(row.marginPercent).toBe(50);
    expect(row.missingCostLines).toBe(1);
  });

  it("groups margin by product for non voided sales", () => {
    const rows = getMarginByProduct([
      {
        isVoided: false,
        items: [
          { productName: "Melena", quantity: 2, lineTotal: 200, unitCost: 30 },
          { productName: "Reishi", quantity: 1, lineTotal: 80, unitCost: 50 },
        ],
      },
      {
        isVoided: false,
        items: [{ productName: "Melena", quantity: 1, lineTotal: 100, unitCost: 30 }],
      },
      {
        isVoided: true,
        items: [{ productName: "Reishi", quantity: 10, lineTotal: 800, unitCost: 50 }],
      },
    ]);

    expect(rows.map((row) => row.productName)).toEqual(["Melena", "Reishi"]);
    expect(rows[0]).toMatchObject({ quantity: 3, revenue: 300, cost: 90, margin: 210, marginPercent: 70 });
    expect(rows[1]).toMatchObject({ quantity: 1, revenue: 80, cost: 50, margin: 30 });
  });

  it("formats percentages with one decimal or a dash", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(70)).toBe("70%");
    expect(formatPercent(33.333)).toMatch(/^33[,.]3%$/);
  });
});
