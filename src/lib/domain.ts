export type PaymentStatus = "pending" | "partial" | "paid";
export type ContactType = "client" | "supplier";
export type EntityType = "product" | "supply";
export type BatchStatus = "draft" | "active" | "completed" | "cancelled";
export type SaleCustomerMode = "existing" | "inline" | "anonymous";
export type AppRole = "admin" | "operator";

export type ActionResponse<T = void> = {
  success: boolean;
  message: string;
  error?: string;
  data?: T;
};

export type ProfileSummary = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: AppRole;
};

export type LookupOption = {
  id: string;
  name: string;
};

export type ContactRecord = {
  id: string;
  type: ContactType;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ProductRecord = {
  id: string;
  name: string;
  category: string;
  unit: string;
  salePrice: number;
  minStock: number;
  notes: string | null;
  isActive: boolean;
  currentStock: number;
  /** Costo promedio ponderado; null cuando no se envia (operador) o no se cargo. */
  avgCost: number | null;
  createdAt: string;
};

export type ProductCategoryRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

export type PriceTierRecord = {
  id: string;
  productId: string;
  minQty: number;
  unitPrice: number;
};

export type BundleItemRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type BundleRecord = {
  id: string;
  name: string;
  salePrice: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  items: BundleItemRecord[];
};

export type SupplyRecord = {
  id: string;
  name: string;
  unit: string;
  minStock: number;
  notes: string | null;
  isActive: boolean;
  currentStock: number;
  lastPurchaseAt: string | null;
  /** Costo promedio ponderado; null cuando no se envia (operador) o no se cargo. */
  avgCost: number | null;
  createdAt: string;
};

export type SaleOrderItemRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  listPrice: number | null;
  bundleId: string | null;
  bundleName: string | null;
  /** Costo unitario congelado al vender; null si no se registro o no se envia (operador). */
  unitCost: number | null;
};

export type SalePaymentRecord = {
  id: string;
  amount: number;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Cobro anulado (venta vuelta a pendiente o dinero devuelto al anular la venta): no suma. */
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
};

export type SaleOrderRecord = {
  id: string;
  saleDate: string;
  contactName: string | null;
  channelName: string | null;
  totalAmount: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  notes: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  totalUnits: number;
  createdAt: string;
  items: SaleOrderItemRecord[];
  payments: SalePaymentRecord[];
};

export type ExpenseRecord = {
  id: string;
  expenseDate: string;
  concept: string;
  categoryName: string | null;
  amount: number;
  source: "manual" | "purchase";
  notes: string | null;
  supplierName: string | null;
  linkedPurchaseId: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type PurchaseRecord = {
  id: string;
  purchaseDate: string;
  supplierName: string | null;
  totalAmount: number;
  notes: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type InventoryMovementRecord = {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityUnit: string | null;
  movementType: "purchase_in" | "sale_out" | "production_in" | "production_out" | "adjustment";
  quantity: number;
  movementDate: string;
  referenceType: string;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type BatchInputRecord = {
  id: string;
  supplyId: string;
  supplyName: string;
  quantity: number;
  /** Costo unitario fijado al completar el lote; null si no hay o no se envia (operador). */
  unitCost: number | null;
};

export type BatchOutputRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type ProductionBatchRecord = {
  id: string;
  productId: string;
  productName: string;
  status: BatchStatus;
  startedAt: string;
  completedAt: string | null;
  expectedQty: number | null;
  actualQty: number | null;
  notes: string | null;
  inventoryPostedAt: string | null;
  totalCost: number | null;
  unitCost: number | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  inputs: BatchInputRecord[];
  outputs: BatchOutputRecord[];
};

export type StockAlertRecord = {
  id: string;
  label: string;
  currentStock: number;
  minStock: number;
  unit: string;
  type: "product" | "supply";
};

export type DashboardData = {
  monthlyBilled: number;
  /** Caja del mes: cobros activos con fecha de cobro en el mes (hora argentina), de ventas no anuladas. */
  monthlyCollected: number;
  monthlyExpenses: number;
  /** Facturado del mes menos gastos del mes (lo que muestra "Resultado"). */
  accrualProfit: number;
  /** Cobrado del mes (caja) menos gastos del mes. */
  cashProfit: number;
  pendingReceivables: number;
  /** Margen bruto de las ventas del mes (solo admin; null para operador). */
  monthlyGrossMargin: { margin: number; marginPercent: number | null; missingCostLines: number } | null;
  soldUnits: number;
  lowStockProducts: StockAlertRecord[];
  lowStockSupplies: StockAlertRecord[];
  recentSales: SaleOrderRecord[];
  channelShare: { name: string; percentage: number }[];
  expenseShare: { name: string; percentage: number }[];
};
