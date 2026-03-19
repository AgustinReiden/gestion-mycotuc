export type PaymentStatus = "pending" | "partial" | "paid";
export type ContactType = "client" | "supplier";
export type EntityType = "product" | "supply";
export type BatchStatus = "draft" | "active" | "completed" | "cancelled";

export type ActionResponse = {
  success: boolean;
  message: string;
  error?: string;
};

export type ProfileSummary = {
  id: string;
  fullName: string | null;
  email: string | null;
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
  createdAt: string;
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
  createdAt: string;
};

export type SaleOrderItemRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SaleOrderRecord = {
  id: string;
  saleDate: string;
  contactName: string | null;
  channelName: string | null;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  notes: string | null;
  totalUnits: number;
  createdAt: string;
  items: SaleOrderItemRecord[];
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
  createdAt: string;
};

export type PurchaseRecord = {
  id: string;
  purchaseDate: string;
  supplierName: string | null;
  totalAmount: number;
  notes: string | null;
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
  monthlySales: number;
  monthlyExpenses: number;
  netProfit: number;
  soldUnits: number;
  lowStockProducts: StockAlertRecord[];
  lowStockSupplies: StockAlertRecord[];
  recentSales: SaleOrderRecord[];
  channelShare: { name: string; percentage: number }[];
  expenseShare: { name: string; percentage: number }[];
};
