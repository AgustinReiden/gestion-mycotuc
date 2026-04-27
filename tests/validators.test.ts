import { describe, expect, it } from "vitest";
import {
  paymentStatusUpdateSchema,
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

  it("accepts reversal payloads with optional reason", () => {
    const result = reversalSchema.safeParse({
      id: ids.sale,
      reason: "Error de carga",
    });

    expect(result.success).toBe(true);
  });
});
