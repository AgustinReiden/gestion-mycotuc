import type { Database } from "@/lib/database.types";
import type {
  BundleRecord,
  ContactRecord,
  ExpenseRecord,
  InventoryMovementRecord,
  LookupOption,
  PriceTierRecord,
  ProductCategoryRecord,
  ProductRecord,
  ProductionBatchRecord,
  PurchaseRecord,
  SaleOrderItemRecord,
  SaleOrderRecord,
  SalePaymentRecord,
  SupplyRecord,
} from "@/lib/domain";
import { sumBy, toNumber } from "@/lib/utils";

/**
 * Unica fuente de los mapeos fila de base -> registro de dominio.
 * Los usan tanto las consultas (src/lib/queries.ts) como las acciones (src/actions/*).
 * Los tipos de entrada salen de database.types.ts; los embeds de PostgREST se describen
 * con los tipos estructurales de abajo (la forma que devuelve cada select).
 */

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
type NameEmbed = { name: string } | null;

export type ContactRow = Tables["contacts"]["Row"];
export type ProductOverviewRow = Views["product_inventory_overview"]["Row"];
export type SupplyOverviewRow = Views["supply_inventory_overview"]["Row"];
export type InventoryMovementRow = Views["inventory_movement_details"]["Row"];
export type PriceTierRow = Pick<
  Tables["product_price_tiers"]["Row"],
  "id" | "product_id" | "min_qty" | "unit_price"
>;
export type ProductCategoryRow = Pick<Tables["product_categories"]["Row"], "id" | "name" | "is_active">;
export type LookupRow = { id: string; name: string };

export type SaleOrderItemRow = Pick<
  Tables["sales_order_items"]["Row"],
  "id" | "product_id" | "bundle_id" | "quantity" | "unit_price" | "list_price" | "line_total"
> & {
  products: NameEmbed;
  product_bundles: NameEmbed;
};

export type SalePaymentRow = Pick<
  Tables["sale_payments"]["Row"],
  "id" | "amount" | "payment_method" | "paid_at" | "created_at" | "voided_at" | "void_reason"
>;

export type SaleOrderRow = Pick<
  Tables["sales_orders"]["Row"],
  | "id"
  | "sale_date"
  | "total_amount"
  | "amount_paid"
  | "payment_status"
  | "payment_method"
  | "paid_at"
  | "notes"
  | "voided_at"
  | "void_reason"
  | "created_at"
> & {
  contacts: NameEmbed;
  sales_channels: NameEmbed;
  sales_order_items: SaleOrderItemRow[];
  sale_payments: SalePaymentRow[];
};

export type BundleRow = Pick<
  Tables["product_bundles"]["Row"],
  "id" | "name" | "sale_price" | "notes" | "is_active" | "created_at"
> & {
  product_bundle_items: Array<
    Pick<Tables["product_bundle_items"]["Row"], "id" | "product_id" | "quantity"> & {
      products: NameEmbed;
    }
  >;
};

export type ExpenseRow = Pick<
  Tables["expenses"]["Row"],
  | "id"
  | "expense_date"
  | "concept"
  | "amount"
  | "source"
  | "notes"
  | "linked_purchase_id"
  | "voided_at"
  | "void_reason"
  | "created_at"
> & {
  expense_categories: NameEmbed;
  purchases: { contacts: NameEmbed } | null;
};

export type PurchaseRow = Pick<
  Tables["purchases"]["Row"],
  "id" | "purchase_date" | "total_amount" | "notes" | "voided_at" | "void_reason" | "created_at"
> & {
  contacts: NameEmbed;
};

export type ProductionBatchRow = Pick<
  Tables["production_batches"]["Row"],
  | "id"
  | "product_id"
  | "status"
  | "started_at"
  | "completed_at"
  | "expected_qty"
  | "actual_qty"
  | "notes"
  | "inventory_posted_at"
  | "voided_at"
  | "void_reason"
  | "created_at"
> & {
  products: NameEmbed;
  production_batch_inputs: Array<
    Pick<Tables["production_batch_inputs"]["Row"], "id" | "supply_id" | "quantity"> & {
      supplies: NameEmbed;
    }
  >;
  production_batch_outputs: Array<
    Pick<Tables["production_batch_outputs"]["Row"], "id" | "product_id" | "quantity"> & {
      products: NameEmbed;
    }
  >;
};

export function toNullableNumber(value: unknown) {
  return value === null || value === undefined ? null : toNumber(value);
}

export function mapLookup(record: LookupRow): LookupOption {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
  };
}

export function mapContact(record: ContactRow): ContactRecord {
  return {
    id: String(record.id ?? ""),
    type: record.type ?? "client",
    name: String(record.name ?? ""),
    phone: record.phone ?? null,
    email: record.email ?? null,
    notes: record.notes ?? null,
    isActive: Boolean(record.is_active),
    createdAt: String(record.created_at ?? ""),
  };
}

export function mapProduct(record: ProductOverviewRow): ProductRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    category: String(record.category ?? ""),
    unit: String(record.unit ?? ""),
    salePrice: toNumber(record.sale_price),
    minStock: toNumber(record.min_stock),
    notes: record.notes ?? null,
    isActive: Boolean(record.is_active),
    currentStock: toNumber(record.current_stock),
    avgCost: null,
    createdAt: String(record.created_at ?? ""),
  };
}

export function mapSupply(record: SupplyOverviewRow): SupplyRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    unit: String(record.unit ?? ""),
    minStock: toNumber(record.min_stock),
    notes: record.notes ?? null,
    isActive: Boolean(record.is_active),
    currentStock: toNumber(record.current_stock),
    lastPurchaseAt: record.last_purchase_at ?? null,
    avgCost: null,
    createdAt: String(record.created_at ?? ""),
  };
}

export function mapSaleItem(record: SaleOrderItemRow): SaleOrderItemRecord {
  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    productName: String(record.products?.name ?? "Producto"),
    quantity: toNumber(record.quantity),
    unitPrice: toNumber(record.unit_price),
    lineTotal: toNumber(record.line_total),
    listPrice:
      record.list_price === null || record.list_price === undefined
        ? null
        : toNumber(record.list_price),
    bundleId: record.bundle_id ?? null,
    bundleName: record.product_bundles?.name ?? null,
    // Los costos no se leen de la tabla (authenticated no tiene SELECT de esa columna):
    // queries.ts los completa para admin con get_sale_item_costs().
    unitCost: null,
  };
}

export function mapSalePayment(record: SalePaymentRow): SalePaymentRecord {
  return {
    id: String(record.id ?? ""),
    amount: toNumber(record.amount),
    paymentMethod: record.payment_method ?? null,
    paidAt: record.paid_at ?? null,
    createdAt: String(record.created_at ?? ""),
    isVoided: Boolean(record.voided_at),
    voidedAt: record.voided_at ?? null,
    voidReason: record.void_reason ?? null,
  };
}

export function mapSale(record: SaleOrderRow): SaleOrderRecord {
  const items = record.sales_order_items.map(mapSaleItem);

  return {
    id: String(record.id ?? ""),
    saleDate: String(record.sale_date ?? ""),
    contactName: record.contacts?.name ?? null,
    channelName: record.sales_channels?.name ?? null,
    totalAmount: toNumber(record.total_amount),
    amountPaid: toNumber(record.amount_paid),
    paymentStatus: record.payment_status ?? "pending",
    paymentMethod: record.payment_method ?? null,
    paidAt: record.paid_at ?? null,
    notes: record.notes ?? null,
    isVoided: Boolean(record.voided_at),
    voidedAt: record.voided_at ?? null,
    voidReason: record.void_reason ?? null,
    totalUnits: sumBy(items, (item) => item.quantity),
    createdAt: String(record.created_at ?? ""),
    items,
    payments: record.sale_payments
      .map(mapSalePayment)
      .sort((left, right) =>
        `${left.paidAt ?? ""}${left.createdAt}`.localeCompare(`${right.paidAt ?? ""}${right.createdAt}`),
      ),
  };
}

export function mapProductCategory(record: ProductCategoryRow): ProductCategoryRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    isActive: Boolean(record.is_active),
  };
}

export function mapPriceTier(record: PriceTierRow): PriceTierRecord {
  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    minQty: toNumber(record.min_qty),
    unitPrice: toNumber(record.unit_price),
  };
}

export function mapBundle(record: BundleRow): BundleRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    salePrice: toNumber(record.sale_price),
    notes: record.notes ?? null,
    isActive: Boolean(record.is_active),
    createdAt: String(record.created_at ?? ""),
    items: record.product_bundle_items
      .map((item) => ({
        id: String(item.id ?? ""),
        productId: String(item.product_id ?? ""),
        productName: String(item.products?.name ?? "Producto"),
        quantity: toNumber(item.quantity),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName, "es")),
  };
}

export function mapExpense(record: ExpenseRow): ExpenseRecord {
  return {
    id: String(record.id ?? ""),
    expenseDate: String(record.expense_date ?? ""),
    concept: String(record.concept ?? ""),
    categoryName: record.expense_categories?.name ?? null,
    amount: toNumber(record.amount),
    source: record.source ?? "manual",
    notes: record.notes ?? null,
    supplierName: record.purchases?.contacts?.name ?? null,
    linkedPurchaseId: record.linked_purchase_id ?? null,
    isVoided: Boolean(record.voided_at),
    voidedAt: record.voided_at ?? null,
    voidReason: record.void_reason ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

export function mapPurchase(record: PurchaseRow): PurchaseRecord {
  return {
    id: String(record.id ?? ""),
    purchaseDate: String(record.purchase_date ?? ""),
    supplierName: record.contacts?.name ?? null,
    totalAmount: toNumber(record.total_amount),
    notes: record.notes ?? null,
    isVoided: Boolean(record.voided_at),
    voidedAt: record.voided_at ?? null,
    voidReason: record.void_reason ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

export function mapInventoryMovement(record: InventoryMovementRow): InventoryMovementRecord {
  return {
    id: String(record.id ?? ""),
    entityType: record.entity_type ?? "product",
    entityId: String(record.entity_id ?? ""),
    entityName: String(record.entity_name ?? "Sin entidad"),
    entityUnit: record.entity_unit ?? null,
    movementType: record.movement_type ?? "adjustment",
    quantity: toNumber(record.quantity),
    movementDate: String(record.movement_date ?? ""),
    referenceType: String(record.reference_type ?? ""),
    referenceId: record.reference_id ?? null,
    notes: record.notes ?? null,
    createdAt: String(record.created_at ?? ""),
    createdByName: record.created_by_name ?? null,
  };
}

export function mapBatch(record: ProductionBatchRow): ProductionBatchRecord {
  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    productName: String(record.products?.name ?? "Producto"),
    status: record.status ?? "draft",
    startedAt: String(record.started_at ?? ""),
    completedAt: record.completed_at ?? null,
    expectedQty: record.expected_qty === null ? null : toNumber(record.expected_qty),
    actualQty: record.actual_qty === null ? null : toNumber(record.actual_qty),
    notes: record.notes ?? null,
    inventoryPostedAt: record.inventory_posted_at ?? null,
    // Costos en null: queries.ts los completa para admin con get_batch_costs().
    totalCost: null,
    unitCost: null,
    isVoided: Boolean(record.voided_at),
    voidedAt: record.voided_at ?? null,
    voidReason: record.void_reason ?? null,
    createdAt: String(record.created_at ?? ""),
    inputs: record.production_batch_inputs.map((input) => ({
      id: String(input.id ?? ""),
      supplyId: String(input.supply_id ?? ""),
      supplyName: String(input.supplies?.name ?? "Insumo"),
      quantity: toNumber(input.quantity),
      unitCost: null,
    })),
    outputs: record.production_batch_outputs.map((output) => ({
      id: String(output.id ?? ""),
      productId: String(output.product_id ?? ""),
      productName: String(output.products?.name ?? "Producto"),
      quantity: toNumber(output.quantity),
    })),
  };
}
