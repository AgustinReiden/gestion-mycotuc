import { endOfMonth, startOfMonth } from "date-fns";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dedupeTags, CACHE_TAGS } from "@/lib/cache";
import type { Database } from "@/lib/database.types";
import type {
  AppRole,
  BundleRecord,
  ContactRecord,
  DashboardData,
  ExpenseRecord,
  InventoryMovementRecord,
  LookupOption,
  PriceTierRecord,
  ProductCategoryRecord,
  ProductRecord,
  ProductionBatchRecord,
  ProfileSummary,
  PurchaseRecord,
  SaleOrderItemRecord,
  SaleOrderRecord,
  SalePaymentRecord,
  StockAlertRecord,
  SupplyRecord,
} from "@/lib/domain";
import { getSupabaseEnv } from "@/lib/env";
import { getSaleBalance, summarizeMargin } from "@/lib/finance";
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

function toNullableNumber(value: unknown) {
  return value === null || value === undefined ? null : toNumber(value);
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
    avgCost: null,
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
    avgCost: null,
    createdAt: String(record.created_at ?? ""),
  };
}

function mapSaleItem(record: RawRecord): SaleOrderItemRecord {
  const product = asRecord(record.products);
  const bundle = asRecord(record.product_bundles);

  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    productName: String(product.name ?? "Producto"),
    quantity: toNumber(record.quantity),
    unitPrice: toNumber(record.unit_price),
    lineTotal: toNumber(record.line_total),
    listPrice:
      record.list_price === null || record.list_price === undefined
        ? null
        : toNumber(record.list_price),
    bundleId: (record.bundle_id as string | null | undefined) ?? null,
    bundleName: (bundle.name as string | null | undefined) ?? null,
    unitCost: toNullableNumber(record.unit_cost),
  };
}

function mapSalePayment(record: RawRecord): SalePaymentRecord {
  return {
    id: String(record.id ?? ""),
    amount: toNumber(record.amount),
    paymentMethod: (record.payment_method as string | null | undefined) ?? null,
    paidAt: (record.paid_at as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
  };
}

function mapProductCategory(record: RawRecord): ProductCategoryRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    isActive: Boolean(record.is_active),
  };
}

function mapPriceTier(record: RawRecord): PriceTierRecord {
  return {
    id: String(record.id ?? ""),
    productId: String(record.product_id ?? ""),
    minQty: toNumber(record.min_qty),
    unitPrice: toNumber(record.unit_price),
  };
}

function mapBundle(record: RawRecord): BundleRecord {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    salePrice: toNumber(record.sale_price),
    notes: (record.notes as string | null | undefined) ?? null,
    isActive: Boolean(record.is_active),
    createdAt: String(record.created_at ?? ""),
    items: asArray(record.product_bundle_items)
      .map((item) => {
        const product = asRecord(item.products);

        return {
          id: String(item.id ?? ""),
          productId: String(item.product_id ?? ""),
          productName: String(product.name ?? "Producto"),
          quantity: toNumber(item.quantity),
        };
      })
      .sort((left, right) => left.productName.localeCompare(right.productName, "es")),
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
    amountPaid: toNumber(record.amount_paid),
    paymentStatus: (record.payment_status as SaleOrderRecord["paymentStatus"]) ?? "pending",
    paymentMethod: (record.payment_method as string | null | undefined) ?? null,
    paidAt: (record.paid_at as string | null | undefined) ?? null,
    notes: (record.notes as string | null | undefined) ?? null,
    isVoided: Boolean(record.voided_at),
    voidedAt: (record.voided_at as string | null | undefined) ?? null,
    voidReason: (record.void_reason as string | null | undefined) ?? null,
    totalUnits: sumBy(items, (item) => item.quantity),
    createdAt: String(record.created_at ?? ""),
    items,
    payments: asArray(record.sale_payments)
      .map(mapSalePayment)
      .sort((left, right) =>
        `${left.paidAt ?? ""}${left.createdAt}`.localeCompare(`${right.paidAt ?? ""}${right.createdAt}`),
      ),
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
    isVoided: Boolean(record.voided_at),
    voidedAt: (record.voided_at as string | null | undefined) ?? null,
    voidReason: (record.void_reason as string | null | undefined) ?? null,
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
    isVoided: Boolean(record.voided_at),
    voidedAt: (record.voided_at as string | null | undefined) ?? null,
    voidReason: (record.void_reason as string | null | undefined) ?? null,
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
    totalCost: toNullableNumber(record.total_cost),
    unitCost: toNullableNumber(record.unit_cost),
    isVoided: Boolean(record.voided_at),
    voidedAt: (record.voided_at as string | null | undefined) ?? null,
    voidReason: (record.void_reason as string | null | undefined) ?? null,
    createdAt: String(record.created_at ?? ""),
    inputs: asArray(record.production_batch_inputs).map((input) => {
      const supply = asRecord(input.supplies);

      return {
        id: String(input.id ?? ""),
        supplyId: String(input.supply_id ?? ""),
        supplyName: String(supply.name ?? "Insumo"),
        quantity: toNumber(input.quantity),
        unitCost: toNullableNumber(input.unit_cost),
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

/** Para operadores: los costos no viajan al cliente. */
function hideSaleCosts(sales: SaleOrderRecord[]): SaleOrderRecord[] {
  return sales.map((sale) => ({
    ...sale,
    items: sale.items.map((item) => ({ ...item, unitCost: null })),
  }));
}

function hideBatchCosts(batches: ProductionBatchRecord[]): ProductionBatchRecord[] {
  return batches.map((batch) => ({
    ...batch,
    totalCost: null,
    unitCost: null,
    inputs: batch.inputs.map((input) => ({ ...input, unitCost: null })),
  }));
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
          "id, sale_date, total_amount, amount_paid, payment_status, payment_method, paid_at, notes, voided_at, void_reason, created_at, contacts(name), sales_channels(name), sales_order_items(id, product_id, bundle_id, quantity, unit_price, list_price, line_total, unit_cost, products(name), product_bundles(name)), sale_payments(id, amount, payment_method, paid_at, created_at)",
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
          "id, product_id, status, started_at, completed_at, expected_qty, actual_qty, notes, inventory_posted_at, total_cost, unit_cost, voided_at, void_reason, created_at, products(name), production_batch_inputs(id, supply_id, quantity, unit_cost, supplies(name)), production_batch_outputs(id, product_id, quantity, products(name))",
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
      return (data ?? []).map((record) => mapProductCategory(asRecord(record)));
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
      return (data ?? []).map((record) => mapPriceTier(asRecord(record)));
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
      return (data ?? []).map((record) => mapBundle(asRecord(record)));
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

/** Costos promedio (las vistas de inventario no los exponen). Solo se consulta para admin. */
const getProductCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["product-costs-data"],
    query: async (supabase) => {
      const { data, error } = await supabase.from("products").select("id, avg_cost");
      if (error) throw error;
      return (data ?? []).map((record) => [String(record.id), toNumber(record.avg_cost)] as const);
    },
    revalidate: 120,
    tags: [CACHE_TAGS.products],
  }),
);

const getSupplyCostsData = cache(async () =>
  runUserCachedQuery({
    key: ["supply-costs-data"],
    query: async (supabase) => {
      const { data, error } = await supabase.from("supplies").select("id, avg_cost");
      if (error) throw error;
      return (data ?? []).map((record) => [String(record.id), toNumber(record.avg_cost)] as const);
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

        const { data, error } = await query;
        if (error) throw error;
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
      const { data, error } = await supabase
        .from("purchases")
        .select("id, purchase_date, total_amount, notes, voided_at, void_reason, created_at, contacts(name)")
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      return (data ?? []).map((record) => mapPurchase(asRecord(record)));
    },
    revalidate: 120,
    tags: [CACHE_TAGS.purchases],
  }),
);

export async function getSalesData() {
  const [sales, contacts, products, lookup, priceTiers, bundles, role] = await Promise.all([
    getSalesOrdersData(),
    getContactsData(),
    getProductsData(),
    getLookupData(),
    getPriceTiersData(),
    getBundlesData(),
    getCurrentRole(),
  ]);
  const activeProducts = products.filter((product) => product.isActive);
  const activeProductIds = new Set(activeProducts.map((product) => product.id));

  return {
    sales: role === "admin" ? sales : hideSaleCosts(sales),
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
  const [batches, products, supplies, role] = await Promise.all([
    getProductionBatchesData(),
    getProductsData(),
    getSuppliesData(),
    getCurrentRole(),
  ]);

  return {
    batches: role === "admin" ? batches : hideBatchCosts(batches),
    role,
    products: products.filter((product) => product.isActive),
    supplies: supplies.filter((supply) => supply.isActive),
  };
}

export async function getReportData() {
  const [sales, expenses, products, supplies, batches, role] = await Promise.all([
    getSalesOrdersData(),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
    getProductionBatchesData(),
    getCurrentRole(),
  ]);
  const isAdmin = role === "admin";

  return {
    sales: isAdmin ? sales : hideSaleCosts(sales),
    expenses,
    products,
    supplies,
    batches: isAdmin ? batches : hideBatchCosts(batches),
    role,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [allSales, expenses, products, supplies, role] = await Promise.all([
    getSalesOrdersData(),
    getExpensesRecordsData(),
    getProductsData(),
    getSuppliesData(),
    getCurrentRole(),
  ]);
  const isAdmin = role === "admin";
  const sales = isAdmin ? allSales : hideSaleCosts(allSales);

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
    const key = expense.categoryName ?? "Sin categoria";
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
