import { endOfMonth, startOfMonth } from "date-fns";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dedupeTags, CACHE_TAGS } from "@/lib/cache";
import type { Database } from "@/lib/database.types";
import type {
  AppRole,
  DashboardData,
  ProductRecord,
  ProductionBatchRecord,
  ProfileSummary,
  SaleOrderRecord,
  StockAlertRecord,
  SupplyRecord,
} from "@/lib/domain";
import { getSupabaseEnv } from "@/lib/env";
import { getSaleBalance, summarizeMargin } from "@/lib/finance";
import {
  mapBatch,
  mapBundle,
  mapContact,
  mapExpense,
  mapInventoryMovement,
  mapLookup,
  mapPriceTier,
  mapProduct,
  mapProductCategory,
  mapPurchase,
  mapSale,
  mapSupply,
} from "@/lib/mappers";
import { ensureProfileForUser } from "@/lib/profile-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sumBy, toNumber } from "@/lib/utils";

type QueryClient = SupabaseClient<Database>;
type AuthContext = {
  accessToken: string | null;
  email: string | null;
  userId: string;
};

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

/**
 * Los costos no se leen de las tablas: "authenticated" no tiene SELECT sobre esas columnas.
 * Las consultas base devuelven los costos en null y, solo para admin, se completan con las
 * funciones get_*_costs() de la base (que exigen rol admin).
 */
type BatchCostMaps = {
  batches: Map<string, { totalCost: number | null; unitCost: number | null }>;
  inputs: Map<string, number | null>;
};

function withSaleCosts(sales: SaleOrderRecord[], costs: Map<string, number | null>): SaleOrderRecord[] {
  return sales.map((sale) => ({
    ...sale,
    items: sale.items.map((item) => ({ ...item, unitCost: costs.get(item.id) ?? null })),
  }));
}

function withBatchCosts(batches: ProductionBatchRecord[], costs: BatchCostMaps): ProductionBatchRecord[] {
  return batches.map((batch) => ({
    ...batch,
    totalCost: costs.batches.get(batch.id)?.totalCost ?? null,
    unitCost: costs.batches.get(batch.id)?.unitCost ?? null,
    inputs: batch.inputs.map((input) => ({ ...input, unitCost: costs.inputs.get(input.id) ?? null })),
  }));
}

function toNullableCost(value: number | null) {
  return value === null ? null : toNumber(value);
}

function withAvgCost<T extends { id: string; avgCost: number | null }>(
  records: T[],
  costs: Map<string, number>,
): T[] {
  return records.map((record) => ({ ...record, avgCost: costs.get(record.id) ?? null }));
}

function toRole(value: unknown): AppRole {
  return value === "admin" ? "admin" : "operator";
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
      const { data, error } = await supabase
        .from("sales_orders")
        .select(
          "id, sale_date, total_amount, amount_paid, payment_status, payment_method, paid_at, notes, voided_at, void_reason, created_at, contacts(name), sales_channels(name), sales_order_items(id, product_id, bundle_id, quantity, unit_price, list_price, line_total, products(name), product_bundles(name)), sale_payments(id, amount, payment_method, paid_at, created_at)",
        )
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

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
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, expense_date, concept, amount, source, notes, linked_purchase_id, voided_at, void_reason, created_at, expense_categories(name), purchases(contacts(name))",
        )
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

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
      const { data, error } = await supabase
        .from("production_batches")
        .select(
          "id, product_id, status, started_at, completed_at, expected_qty, actual_qty, notes, inventory_posted_at, voided_at, void_reason, created_at, products(name), production_batch_inputs(id, supply_id, quantity, supplies(name)), production_batch_outputs(id, product_id, quantity, products(name))",
        )
        .order("started_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map(mapBatch);
    },
    revalidate: 90,
    tags: [CACHE_TAGS.production],
  }),
);

export const getProfileSummary = cache(async (): Promise<ProfileSummary | null> => {
  const auth = await getAuthContext();

  if (!auth) {
    return null;
  }

  const cachedProfile = await runUserCachedQuery({
    key: ["profile-summary-v2"],
    query: async (supabase) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("id", auth.userId)
        .maybeSingle();

      return profile
        ? {
            email: profile.email ?? null,
            fullName: profile.full_name ?? null,
            role: toRole(profile.role),
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
      role: cachedProfile.role,
    };
  }

  const supabase = await getSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", auth.userId)
    .maybeSingle();

  const syncedProfile = profile ?? (await ensureProfileForUser(supabase));

  return {
    id: auth.userId,
    fullName: syncedProfile?.full_name ?? auth.email?.split("@")[0] ?? null,
    email: syncedProfile?.email ?? auth.email ?? null,
    role: toRole(syncedProfile?.role),
  };
});

async function getCurrentRole(): Promise<AppRole> {
  const profile = await getProfileSummary();
  return profile?.role ?? "operator";
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
      const { data, error } = await supabase.from("contacts").select("*").order("name");
      if (error) throw error;
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
      const { data, error } = await supabase.from("product_inventory_overview").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(mapProduct);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.products],
  }),
);

export const getProductCategoriesData = cache(async () =>
  runUserCachedQuery({
    key: ["product-categories-data"],
    query: async (supabase) => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((record) => mapProductCategory(record));
    },
    revalidate: 900,
    tags: [CACHE_TAGS.categories],
  }),
);

export const getPriceTiersData = cache(async () =>
  runUserCachedQuery({
    key: ["price-tiers-data"],
    query: async (supabase) => {
      const { data, error } = await supabase
        .from("product_price_tiers")
        .select("id, product_id, min_qty, unit_price")
        .order("product_id")
        .order("min_qty");
      if (error) throw error;
      return (data ?? []).map((record) => mapPriceTier(record));
    },
    revalidate: 300,
    tags: [CACHE_TAGS.priceTiers],
  }),
);

export const getBundlesData = cache(async () =>
  runUserCachedQuery({
    key: ["bundles-data"],
    query: async (supabase) => {
      const { data, error } = await supabase
        .from("product_bundles")
        .select(
          "id, name, sale_price, notes, is_active, created_at, product_bundle_items(id, product_id, quantity, products(name))",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((record) => mapBundle(record));
    },
    revalidate: 300,
    tags: [CACHE_TAGS.bundles, CACHE_TAGS.products],
  }),
);

export const getSuppliesData = cache(async () =>
  runUserCachedQuery({
    key: ["supplies-data"],
    query: async (supabase) => {
      const { data, error } = await supabase.from("supply_inventory_overview").select("*").order("name");
      if (error) throw error;
      return (data ?? []).map(mapSupply);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.supplies],
  }),
);

/** Costos promedio por funcion solo-admin (las tablas no exponen avg_cost). Solo se consulta para admin. */
const getProductCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["product-costs-data-v2"],
    query: async (supabase) => {
      const { data, error } = await supabase.rpc("get_product_costs");
      if (error) throw error;
      return (data ?? []).map((record) => [String(record.id), toNumber(record.avg_cost)] as const);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.products],
  }),
);

const getSupplyCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["supply-costs-data-v2"],
    query: async (supabase) => {
      const { data, error } = await supabase.rpc("get_supply_costs");
      if (error) throw error;
      return (data ?? []).map((record) => [String(record.id), toNumber(record.avg_cost)] as const);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.supplies],
  }),
);

/** Costo unitario congelado de cada linea de venta (null = sin costo). Solo admin. */
const getSaleItemCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["sale-item-costs-data"],
    query: async (supabase) => {
      const { data, error } = await supabase.rpc("get_sale_item_costs");
      if (error) throw error;
      return (data ?? []).map((record) => [String(record.id), toNullableCost(record.unit_cost)] as const);
    },
    revalidate: 90,
    tags: [CACHE_TAGS.sales],
  }),
);

/** Costos de los lotes y de sus insumos. Solo admin. */
const getBatchCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["batch-costs-data"],
    query: async (supabase) => {
      const [batchesResult, inputsResult] = await Promise.all([
        supabase.rpc("get_batch_costs"),
        supabase.rpc("get_batch_input_costs"),
      ]);
      if (batchesResult.error) throw batchesResult.error;
      if (inputsResult.error) throw inputsResult.error;

      return {
        batches: (batchesResult.data ?? []).map(
          (record) =>
            [String(record.id), toNullableCost(record.total_cost), toNullableCost(record.unit_cost)] as const,
        ),
        inputs: (inputsResult.data ?? []).map(
          (record) => [String(record.id), toNullableCost(record.unit_cost)] as const,
        ),
      };
    },
    revalidate: 90,
    tags: [CACHE_TAGS.production],
  }),
);

async function getSalesForRole(role: AppRole) {
  const sales = await getSalesOrdersData();

  if (role !== "admin") {
    return sales;
  }

  return withSaleCosts(sales, new Map(await getSaleItemCostsData()));
}

async function getBatchesForRole(role: AppRole) {
  const batches = await getProductionBatchesData();

  if (role !== "admin") {
    return batches;
  }

  const costs = await getBatchCostsData();

  return withBatchCosts(batches, {
    batches: new Map(
      costs.batches.map(([id, totalCost, unitCost]) => [id, { totalCost, unitCost }] as const),
    ),
    inputs: new Map(costs.inputs),
  });
}

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

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map((record) => mapInventoryMovement(record));
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
      const { data, error } = await supabase
        .from("purchases")
        .select("id, purchase_date, total_amount, notes, voided_at, void_reason, created_at, contacts(name)")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      return (data ?? []).map((record) => mapPurchase(record));
    },
    revalidate: 120,
    tags: [CACHE_TAGS.purchases],
  }),
);

export async function getSalesData() {
  const role = await getCurrentRole();
  const [sales, contacts, products, lookup, priceTiers, bundles] = await Promise.all([
    getSalesForRole(role),
    getContactsData(),
    getProductsData(),
    getLookupData(),
    getPriceTiersData(),
    getBundlesData(),
  ]);
  const activeProducts = products.filter((product) => product.isActive);
  const activeProductIds = new Set(activeProducts.map((product) => product.id));

  return {
    sales,
    contacts: contacts.filter((contact) => contact.type === "client" && contact.isActive),
    products: activeProducts,
    channels: lookup.channels,
    priceTiers: priceTiers.filter((tier) => activeProductIds.has(tier.productId)),
    bundles: bundles.filter(
      (bundle) =>
        bundle.isActive &&
        bundle.items.length > 0 &&
        bundle.items.every((item) => activeProductIds.has(item.productId)),
    ),
    role,
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
  const [supplies, contacts, purchases, movements, role] = await Promise.all([
    getSuppliesData(),
    getContactsData(),
    getPurchasesData(),
    getInventoryMovementsData("supply"),
    getCurrentRole(),
  ]);
  const costs = role === "admin" ? new Map(await getSupplyCostsData()) : null;

  return {
    supplies: costs ? withAvgCost(supplies, costs) : supplies,
    suppliers: contacts.filter((contact) => contact.type === "supplier" && contact.isActive),
    purchases,
    movements,
    role,
  };
}

export async function getProductsPageData() {
  const [products, movements, categories, priceTiers, bundles, role] = await Promise.all([
    getProductsData(),
    getInventoryMovementsData("product"),
    getProductCategoriesData(),
    getPriceTiersData(),
    getBundlesData(),
    getCurrentRole(),
  ]);

  const costs = role === "admin" ? new Map(await getProductCostsData()) : null;

  return {
    products: costs ? withAvgCost(products, costs) : products,
    movements,
    categories,
    priceTiers,
    bundles,
    role,
  };
}

export async function getProductionData() {
  const role = await getCurrentRole();
  const [batches, products, supplies] = await Promise.all([
    getBatchesForRole(role),
    getProductsData(),
    getSuppliesData(),
  ]);

  return {
    batches,
    role,
    products: products.filter((product) => product.isActive),
    supplies: supplies.filter((supply) => supply.isActive),
  };
}

export async function getReportData() {
  const role = await getCurrentRole();
  const [sales, expenses, products, supplies, batches] = await Promise.all([
    getSalesForRole(role),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
    getBatchesForRole(role),
  ]);

  return {
    sales,
    expenses,
    products,
    supplies,
    batches,
    role,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const role = await getCurrentRole();
  const [sales, expenses, products, supplies] = await Promise.all([
    getSalesForRole(role),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
  ]);
  const isAdmin = role === "admin";

  const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
  const monthEnd = endOfMonth(new Date()).toISOString().slice(0, 10);

  const activeSales = sales.filter((sale) => !sale.isVoided);
  const activeExpenses = expenses.filter((expense) => !expense.isVoided);
  const monthlySales = activeSales.filter(
    (sale) => sale.saleDate >= monthStart && sale.saleDate <= monthEnd,
  );
  const monthlyExpenses = activeExpenses.filter(
    (expense) => expense.expenseDate >= monthStart && expense.expenseDate <= monthEnd,
  );
  const recentSales = activeSales.slice(0, 5);

  const channelTotals = new Map<string, number>();
  monthlySales.forEach((sale) => {
    const key = sale.channelName ?? "Sin canal";
    channelTotals.set(key, (channelTotals.get(key) ?? 0) + sale.totalAmount);
  });

  const expenseTotals = new Map<string, number>();
  monthlyExpenses.forEach((expense) => {
    const key = expense.categoryName ?? "Sin categoría";
    expenseTotals.set(key, (expenseTotals.get(key) ?? 0) + expense.amount);
  });

  const totalSalesAmount = sumBy(monthlySales, (sale) => sale.totalAmount);
  // Lo cobrado incluye los cobros parciales; el saldo es total menos lo cobrado.
  const collectedSalesAmount = sumBy(monthlySales, (sale) => sale.amountPaid);
  const totalExpensesAmount = sumBy(monthlyExpenses, (expense) => expense.amount);
  const pendingReceivables = sumBy(activeSales, (sale) =>
    getSaleBalance(sale.totalAmount, sale.amountPaid),
  );
  const monthlyMargin = isAdmin
    ? summarizeMargin(monthlySales.flatMap((sale) => sale.items))
    : null;

  const lowStockProducts = products
    .filter((product) => product.isActive && product.currentStock <= product.minStock)
    .map((product) => toStockAlert(product, "product"));
  const lowStockSupplies = supplies
    .filter((supply) => supply.isActive && supply.currentStock <= supply.minStock)
    .map((supply) => toStockAlert(supply, "supply"));

  return {
    monthlyBilled: totalSalesAmount,
    monthlyCollected: collectedSalesAmount,
    monthlyExpenses: totalExpensesAmount,
    accrualProfit: totalSalesAmount - totalExpensesAmount,
    cashProfit: collectedSalesAmount - totalExpensesAmount,
    pendingReceivables,
    monthlyGrossMargin: monthlyMargin
      ? {
          margin: monthlyMargin.margin,
          marginPercent: monthlyMargin.marginPercent,
          missingCostLines: monthlyMargin.missingCostLines,
        }
      : null,
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
