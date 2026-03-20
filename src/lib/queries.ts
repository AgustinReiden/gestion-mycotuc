import { endOfMonth, startOfMonth } from "date-fns";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dedupeTags, CACHE_TAGS } from "@/lib/cache";
import type { Database } from "@/lib/database.types";
import type {
  ContactRecord,
  DashboardData,
  ExpenseRecord,
  InventoryMovementRecord,
  LookupOption,
  ProductRecord,
  ProductionBatchRecord,
  ProfileSummary,
  PurchaseRecord,
  SaleOrderItemRecord,
  SaleOrderRecord,
  StockAlertRecord,
  SupplyRecord,
} from "@/lib/domain";
import { getSupabaseEnv } from "@/lib/env";
import { ensureProfileForUser } from "@/lib/profile-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sumBy, toNumber } from "@/lib/utils";

type RawRecord = Record<string, unknown>;
type QueryClient = SupabaseClient<Database>;
type AuthContext = {
  accessToken: string | null;
  email: string | null;
  userId: string;
};

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? (value as RawRecord) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => asRecord(entry)) : [];
}

function mapLookup(record: RawRecord): LookupOption {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
  };
}

function mapContact(record: RawRecord): ContactRecord {
  return {
    id: String(record.id ?? ""),
    type: (record.type as ContactRecord["type"]) ?? "client",
    name: String(record.name ?? ""),
    phone: (record.phone as string | null | undefined) ?? null,
    email: (record.email as string | null | undefined) ?? null,
    notes: (record.notes as string | null | undefined) ?? null,
    isActive: Boolean(record.is_active),
    createdAt: String(record.created_at ?? ""),
  };
}

function mapProduct(record: RawRecord): ProductRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    category: String(record.category ?? ""),
    unit: String(record.unit ?? ""),
    salePrice: toNumber(record.sale_price),
    minStock: toNumber(record.min_stock),
    notes: (record.notes as string | null | undefined) ?? null,
    isActive: Boolean(record.is_active),
    currentStock: toNumber(record.current_stock),
    createdAt: String(record.created_at ?? ""),
  };
}

function mapSupply(record: RawRecord): SupplyRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    unit: String(record.unit ?? ""),
    minStock: toNumber(record.min_stock),
    notes: (record.notes as string | null | undefined) ?? null,
    isActive: Boolean(record.is_active),
    currentStock: toNumber(record.current_stock),
    lastPurchaseAt: (record.last_purchase_at as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

function mapSaleItem(record: RawRecord): SaleOrderItemRecord {
  const product = asRecord(record.products);

  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    productName: String(product.name ?? "Producto"),
    quantity: toNumber(record.quantity),
    unitPrice: toNumber(record.unit_price),
    lineTotal: toNumber(record.line_total),
  };
}

function mapSale(record: RawRecord): SaleOrderRecord {
  const items = asArray(record.sales_order_items).map(mapSaleItem);
  const contact = asRecord(record.contacts);
  const channel = asRecord(record.sales_channels);

  return {
    id: String(record.id ?? ""),
    saleDate: String(record.sale_date ?? ""),
    contactName: (contact.name as string | null | undefined) ?? null,
    channelName: (channel.name as string | null | undefined) ?? null,
    totalAmount: toNumber(record.total_amount),
    paymentStatus: (record.payment_status as SaleOrderRecord["paymentStatus"]) ?? "pending",
    paymentMethod: (record.payment_method as string | null | undefined) ?? null,
    paidAt: (record.paid_at as string | null | undefined) ?? null,
    notes: (record.notes as string | null | undefined) ?? null,
    totalUnits: sumBy(items, (item) => item.quantity),
    createdAt: String(record.created_at ?? ""),
    items,
  };
}

function mapExpense(record: RawRecord): ExpenseRecord {
  const category = asRecord(record.expense_categories);
  const purchase = asRecord(record.purchases);
  const supplier = asRecord(purchase.contacts);

  return {
    id: String(record.id ?? ""),
    expenseDate: String(record.expense_date ?? ""),
    concept: String(record.concept ?? ""),
    categoryName: (category.name as string | null | undefined) ?? null,
    amount: toNumber(record.amount),
    source: (record.source as ExpenseRecord["source"]) ?? "manual",
    notes: (record.notes as string | null | undefined) ?? null,
    supplierName: (supplier.name as string | null | undefined) ?? null,
    linkedPurchaseId: (record.linked_purchase_id as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

function mapPurchase(record: RawRecord): PurchaseRecord {
  const contact = asRecord(record.contacts);

  return {
    id: String(record.id ?? ""),
    purchaseDate: String(record.purchase_date ?? ""),
    supplierName: (contact.name as string | null | undefined) ?? null,
    totalAmount: toNumber(record.total_amount),
    notes: (record.notes as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

function mapInventoryMovement(record: RawRecord): InventoryMovementRecord {
  return {
    id: String(record.id ?? ""),
    entityType: (record.entity_type as InventoryMovementRecord["entityType"]) ?? "product",
    entityId: String(record.entity_id ?? ""),
    entityName: String(record.entity_name ?? "Sin entidad"),
    entityUnit: (record.entity_unit as string | null | undefined) ?? null,
    movementType:
      (record.movement_type as InventoryMovementRecord["movementType"]) ?? "adjustment",
    quantity: toNumber(record.quantity),
    movementDate: String(record.movement_date ?? ""),
    referenceType: String(record.reference_type ?? ""),
    referenceId: (record.reference_id as string | null | undefined) ?? null,
    notes: (record.notes as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
    createdByName: (record.created_by_name as string | null | undefined) ?? null,
  };
}

function mapBatch(record: RawRecord): ProductionBatchRecord {
  const product = asRecord(record.products);

  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    productName: String(product.name ?? "Producto"),
    status: (record.status as ProductionBatchRecord["status"]) ?? "draft",
    startedAt: String(record.started_at ?? ""),
    completedAt: (record.completed_at as string | null | undefined) ?? null,
    expectedQty: record.expected_qty === null ? null : toNumber(record.expected_qty),
    actualQty: record.actual_qty === null ? null : toNumber(record.actual_qty),
    notes: (record.notes as string | null | undefined) ?? null,
    inventoryPostedAt: (record.inventory_posted_at as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
    inputs: asArray(record.production_batch_inputs).map((input) => {
      const supply = asRecord(input.supplies);

      return {
        id: String(input.id ?? ""),
        supplyId: String(input.supply_id ?? ""),
        supplyName: String(supply.name ?? "Insumo"),
        quantity: toNumber(input.quantity),
      };
    }),
    outputs: asArray(record.production_batch_outputs).map((output) => {
      const outputProduct = asRecord(output.products);

      return {
        id: String(output.id ?? ""),
        productId: String(output.product_id ?? ""),
        productName: String(outputProduct.name ?? "Producto"),
        quantity: toNumber(output.quantity),
      };
    }),
  };
}

function toStockAlert(record: ProductRecord | SupplyRecord, type: "product" | "supply"): StockAlertRecord {
  return {
    id: record.id,
    label: record.name,
    currentStock: record.currentStock,
    minStock: record.minStock,
    unit: record.unit,
    type,
  };
}

function createSupabaseAuthorizedClient(accessToken: string): QueryClient {
  const { url, anonKey } = getSupabaseEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

const getSupabase = cache(async () => createSupabaseServerClient());

const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await getSupabase();
  const [
    {
      data: { user },
    },
    {
      data: { session },
    },
  ] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]);

  if (!user) {
    return null;
  }

  return {
    accessToken: session?.access_token ?? null,
    email: user.email ?? null,
    userId: user.id,
  };
});

async function runLiveQuery<T>(query: (supabase: QueryClient) => Promise<T>) {
  const supabase = await getSupabase();
  return query(supabase);
}

async function runUserCachedQuery<T>({
  key,
  query,
  revalidate = 120,
  tags,
}: {
  key: string[];
  query: (supabase: QueryClient) => Promise<T>;
  revalidate?: number;
  tags: string[];
}) {
  const auth = await getAuthContext();

  if (!auth?.userId || !auth.accessToken) {
    return runLiveQuery(query);
  }

  const cachedQuery = unstable_cache(
    async () => query(createSupabaseAuthorizedClient(auth.accessToken!)),
    [...key, auth.userId],
    {
      revalidate,
      tags,
    },
  );

  return cachedQuery();
}

const getSalesOrdersData = cache(async () =>
  runUserCachedQuery({
    key: ["sales-orders-data"],
    query: async (supabase) => {
      const { data } = await supabase
        .from("sales_orders")
        .select(
          "id, sale_date, total_amount, payment_status, payment_method, paid_at, notes, created_at, contacts(name), sales_channels(name), sales_order_items(id, product_id, quantity, unit_price, line_total, products(name))",
        )
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false });

      return (data ?? []).map(mapSale);
    },
    revalidate: 90,
    tags: [CACHE_TAGS.sales],
  }),
);

const getExpensesRecordsData = cache(async () =>
  runUserCachedQuery({
    key: ["expenses-records-data"],
    query: async (supabase) => {
      const { data } = await supabase
        .from("expenses")
        .select(
          "id, expense_date, concept, amount, source, notes, linked_purchase_id, created_at, expense_categories(name), purchases(contacts(name))",
        )
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });

      return (data ?? []).map(mapExpense);
    },
    revalidate: 90,
    tags: [CACHE_TAGS.expenses],
  }),
);

const getProductionBatchesData = cache(async () =>
  runUserCachedQuery({
    key: ["production-batches-data"],
    query: async (supabase) => {
      const { data } = await supabase
        .from("production_batches")
        .select(
          "id, product_id, status, started_at, completed_at, expected_qty, actual_qty, notes, inventory_posted_at, created_at, products(name), production_batch_inputs(id, supply_id, quantity, supplies(name)), production_batch_outputs(id, product_id, quantity, products(name))",
        )
        .order("started_at", { ascending: false })
        .order("created_at", { ascending: false });

      return (data ?? []).map(mapBatch);
    },
    revalidate: 90,
    tags: [CACHE_TAGS.production],
  }),
);

export async function getProfileSummary(): Promise<ProfileSummary | null> {
  const auth = await getAuthContext();

  if (!auth) {
    return null;
  }

  const cachedProfile = await runUserCachedQuery({
    key: ["profile-summary"],
    query: async (supabase) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", auth.userId)
        .maybeSingle();

      return profile
        ? {
            email: profile.email ?? null,
            fullName: profile.full_name ?? null,
          }
        : null;
    },
    revalidate: 300,
    tags: [CACHE_TAGS.profile],
  });

  if (cachedProfile) {
    return {
      id: auth.userId,
      fullName: cachedProfile.fullName ?? auth.email?.split("@")[0] ?? null,
      email: cachedProfile.email ?? auth.email ?? null,
    };
  }

  const supabase = await getSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", auth.userId)
    .maybeSingle();

  const syncedProfile = profile ?? (await ensureProfileForUser(supabase));

  return {
    id: auth.userId,
    fullName: syncedProfile?.full_name ?? auth.email?.split("@")[0] ?? null,
    email: syncedProfile?.email ?? auth.email ?? null,
  };
}

export const getLookupData = cache(async () =>
  runUserCachedQuery({
    key: ["lookup-data"],
    query: async (supabase) => {
      const [{ data: channels }, { data: categories }] = await Promise.all([
        supabase.from("sales_channels").select("id, name").eq("is_active", true).order("name"),
        supabase.from("expense_categories").select("id, name").eq("is_active", true).order("name"),
      ]);

      return {
        channels: (channels ?? []).map(mapLookup),
        categories: (categories ?? []).map(mapLookup),
      };
    },
    revalidate: 900,
    tags: [CACHE_TAGS.lookups],
  }),
);

export const getContactsData = cache(async () =>
  runUserCachedQuery({
    key: ["contacts-data"],
    query: async (supabase) => {
      const { data } = await supabase.from("contacts").select("*").order("name");
      return (data ?? []).map(mapContact);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.contacts],
  }),
);

export const getProductsData = cache(async () =>
  runUserCachedQuery({
    key: ["products-data"],
    query: async (supabase) => {
      const { data } = await supabase.from("product_inventory_overview").select("*").order("name");
      return (data ?? []).map(mapProduct);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.products],
  }),
);

export const getSuppliesData = cache(async () =>
  runUserCachedQuery({
    key: ["supplies-data"],
    query: async (supabase) => {
      const { data } = await supabase.from("supply_inventory_overview").select("*").order("name");
      return (data ?? []).map(mapSupply);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.supplies],
  }),
);

export const getInventoryMovementsData = cache(
  async (entityType?: "product" | "supply", limit = 12) =>
    runUserCachedQuery({
      key: ["inventory-movements-data", entityType ?? "all", String(limit)],
      query: async (supabase) => {
        let query = supabase
          .from("inventory_movement_details")
          .select("*")
          .order("movement_date", { ascending: false })
          .limit(limit);

        if (entityType) {
          query = query.eq("entity_type", entityType);
        }

        const { data } = await query;
        return (data ?? []).map((record) => mapInventoryMovement(asRecord(record)));
      },
      revalidate: 60,
      tags: dedupeTags(
        entityType !== "supply" && CACHE_TAGS.inventoryProduct,
        entityType !== "product" && CACHE_TAGS.inventorySupply,
      ),
    }),
);

export const getPurchasesData = cache(async (limit = 8) =>
  runUserCachedQuery({
    key: ["purchases-data", String(limit)],
    query: async (supabase) => {
      const { data } = await supabase
        .from("purchases")
        .select("id, purchase_date, total_amount, notes, created_at, contacts(name)")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      return (data ?? []).map((record) => mapPurchase(asRecord(record)));
    },
    revalidate: 120,
    tags: [CACHE_TAGS.purchases],
  }),
);

export async function getSalesData() {
  const [sales, contacts, products, lookup] = await Promise.all([
    getSalesOrdersData(),
    getContactsData(),
    getProductsData(),
    getLookupData(),
  ]);

  return {
    sales,
    contacts: contacts.filter((contact) => contact.type === "client" && contact.isActive),
    products: products.filter((product) => product.isActive),
    channels: lookup.channels,
  };
}

export async function getExpensesData() {
  const [expenses, lookup] = await Promise.all([getExpensesRecordsData(), getLookupData()]);

  return {
    expenses,
    categories: lookup.categories,
  };
}

export async function getSuppliesPageData() {
  const [supplies, contacts, purchases, movements] = await Promise.all([
    getSuppliesData(),
    getContactsData(),
    getPurchasesData(),
    getInventoryMovementsData("supply"),
  ]);

  return {
    supplies,
    suppliers: contacts.filter((contact) => contact.type === "supplier" && contact.isActive),
    purchases,
    movements,
  };
}

export async function getProductsPageData() {
  const [products, movements] = await Promise.all([
    getProductsData(),
    getInventoryMovementsData("product"),
  ]);

  return {
    products,
    movements,
  };
}

export async function getProductionData() {
  const [batches, products, supplies] = await Promise.all([
    getProductionBatchesData(),
    getProductsData(),
    getSuppliesData(),
  ]);

  return {
    batches,
    products: products.filter((product) => product.isActive),
    supplies: supplies.filter((supply) => supply.isActive),
  };
}

export async function getReportData() {
  const [sales, expenses, products, supplies, batches] = await Promise.all([
    getSalesOrdersData(),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
    getProductionBatchesData(),
  ]);

  return {
    sales,
    expenses,
    products,
    supplies,
    batches,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [sales, expenses, products, supplies] = await Promise.all([
    getSalesOrdersData(),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
  ]);

  const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(new Date()).toISOString().slice(0, 10);

  const monthlySales = sales.filter(
    (sale) => sale.saleDate >= monthStart && sale.saleDate <= monthEnd,
  );
  const monthlyExpenses = expenses.filter(
    (expense) => expense.expenseDate >= monthStart && expense.expenseDate <= monthEnd,
  );
  const recentSales = sales.slice(0, 5);

  const channelTotals = new Map<string, number>();
  monthlySales.forEach((sale) => {
    const key = sale.channelName ?? "Sin canal";
    channelTotals.set(key, (channelTotals.get(key) ?? 0) + sale.totalAmount);
  });

  const expenseTotals = new Map<string, number>();
  monthlyExpenses.forEach((expense) => {
    const key = expense.categoryName ?? "Sin categoria";
    expenseTotals.set(key, (expenseTotals.get(key) ?? 0) + expense.amount);
  });

  const totalSalesAmount = sumBy(monthlySales, (sale) => sale.totalAmount);
  const totalExpensesAmount = sumBy(monthlyExpenses, (expense) => expense.amount);

  const lowStockProducts = products
    .filter((product) => product.currentStock <= product.minStock)
    .map((product) => toStockAlert(product, "product"));
  const lowStockSupplies = supplies
    .filter((supply) => supply.currentStock <= supply.minStock)
    .map((supply) => toStockAlert(supply, "supply"));

  return {
    monthlySales: totalSalesAmount,
    monthlyExpenses: totalExpensesAmount,
    netProfit: totalSalesAmount - totalExpensesAmount,
    soldUnits: sumBy(monthlySales, (sale) => sale.totalUnits),
    lowStockProducts,
    lowStockSupplies,
    recentSales,
    channelShare: Array.from(channelTotals.entries())
      .map(([name, amount]) => ({
        name,
        percentage: totalSalesAmount > 0 ? Math.round((amount / totalSalesAmount) * 100) : 0,
      }))
      .sort((left, right) => right.percentage - left.percentage)
      .slice(0, 4),
    expenseShare: Array.from(expenseTotals.entries())
      .map(([name, amount]) => ({
        name,
        percentage:
          totalExpensesAmount > 0 ? Math.round((amount / totalExpensesAmount) * 100) : 0,
      }))
      .sort((left, right) => right.percentage - left.percentage)
      .slice(0, 4),
  };
}
