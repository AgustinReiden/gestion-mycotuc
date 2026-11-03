import {
  mapBatch,
  mapBundle,
  mapContact,
  mapExpense,
  mapInventoryMovement,
  mapProduct,
  mapPurchase,
  mapSale,
  mapSupply,
} from "@/lib/mappers";
import type { SupabaseServerClient } from "./shared";

/**
 * Lecturas puntuales que usan varias acciones para devolver el registro actualizado.
 * No lleva "use server": son helpers internos, no endpoints.
 */

// Sin costos: las acciones devuelven datos a cualquier rol; los costos llegan con el refresco del servidor.
const SALE_ORDER_SELECT =
  "id, sale_date, total_amount, amount_paid, payment_status, payment_method, paid_at, notes, voided_at, void_reason, created_at, contacts(name), sales_channels(name), sales_order_items(id, product_id, bundle_id, quantity, unit_price, list_price, line_total, products(name), product_bundles(name)), sale_payments(id, amount, payment_method, paid_at, created_at, voided_at, void_reason)";
const BUNDLE_SELECT =
  "id, name, sale_price, notes, is_active, created_at, product_bundle_items(id, product_id, quantity, products(name))";
const EXPENSE_SELECT =
  "id, expense_date, concept, amount, source, notes, linked_purchase_id, voided_at, void_reason, created_at, expense_categories(name), purchases(contacts(name))";
const PURCHASE_SELECT =
  "id, purchase_date, total_amount, notes, voided_at, void_reason, created_at, contacts(name)";
const PRODUCTION_BATCH_SELECT =
  "id, product_id, status, started_at, completed_at, expected_qty, actual_qty, notes, inventory_posted_at, voided_at, void_reason, created_at, products(name), production_batch_inputs(id, supply_id, quantity, supplies(name)), production_batch_outputs(id, product_id, quantity, products(name))";

export async function getContactRecord(supabase: SupabaseServerClient, contactId: string) {
  const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapContact(data) : null;
}

export async function getSupplyRecord(supabase: SupabaseServerClient, supplyId: string) {
  const { data, error } = await supabase
    .from("supply_inventory_overview")
    .select("*")
    .eq("id", supplyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSupply(data) : null;
}

export async function getProductRecord(supabase: SupabaseServerClient, productId: string) {
  const { data, error } = await supabase
    .from("product_inventory_overview")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProduct(data) : null;
}

export async function getBundleRecord(supabase: SupabaseServerClient, bundleId: string) {
  const { data, error } = await supabase
    .from("product_bundles")
    .select(BUNDLE_SELECT)
    .eq("id", bundleId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapBundle(data) : null;
}

export async function getProductionBatchRecord(supabase: SupabaseServerClient, batchId: string) {
  const { data, error } = await supabase
    .from("production_batches")
    .select(PRODUCTION_BATCH_SELECT)
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapBatch(data) : null;
}

export async function getSupplyRecords(supabase: SupabaseServerClient, supplyIds: string[]) {
  const uniqueSupplyIds = Array.from(new Set(supplyIds.filter(Boolean)));

  if (uniqueSupplyIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("supply_inventory_overview")
    .select("*")
    .in("id", uniqueSupplyIds);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapSupply);
}

export async function getProductRecords(supabase: SupabaseServerClient, productIds: string[]) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));

  if (uniqueProductIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("product_inventory_overview")
    .select("*")
    .in("id", uniqueProductIds);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProduct);
}

export async function getSaleOrderRecord(supabase: SupabaseServerClient, saleOrderId: string) {
  const { data, error } = await supabase
    .from("sales_orders")
    .select(SALE_ORDER_SELECT)
    .eq("id", saleOrderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSale(data) : null;
}

export async function getExpenseRecord(supabase: SupabaseServerClient, expenseId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("id", expenseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapExpense(data) : null;
}

export async function getExpenseRecordByPurchaseId(supabase: SupabaseServerClient, purchaseId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("linked_purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapExpense(data) : null;
}

export async function getPurchaseRecord(supabase: SupabaseServerClient, purchaseId: string) {
  const { data, error } = await supabase
    .from("purchases")
    .select(PURCHASE_SELECT)
    .eq("id", purchaseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPurchase(data) : null;
}

export async function getMovementRecord(supabase: SupabaseServerClient, movementId: string) {
  const { data, error } = await supabase
    .from("inventory_movement_details")
    .select("*")
    .eq("id", movementId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapInventoryMovement(data) : null;
}

export async function getMovementRecordsByReference(
  supabase: SupabaseServerClient,
  referenceType: string,
  referenceId: string,
) {
  const { data, error } = await supabase
    .from("inventory_movement_details")
    .select("*")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .order("movement_date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapInventoryMovement);
}
