"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache";
import { ANONYMOUS_CUSTOMER_NAME } from "@/lib/constants";
import type {
  ActionResponse,
  ContactRecord,
  ExpenseRecord,
  InventoryMovementRecord,
  ProductRecord,
  ProductionBatchRecord,
  PurchaseRecord,
  SaleOrderRecord,
  SupplyRecord,
} from "@/lib/domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  contactFormSchema,
  expenseFormSchema,
  paymentStatusUpdateSchema,
  productFormSchema,
  productionBatchFormSchema,
  purchaseFormSchema,
  saleOrderFormSchema,
  stockAdjustmentSchema,
  supplyFormSchema,
} from "@/lib/validators";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RawRecord = Record<string, unknown>;
type SaleOrderInput = z.output<typeof saleOrderFormSchema>;
type CreateSaleOrderResult = {
  sale: SaleOrderRecord;
  contact: ContactRecord;
};
type RegisterPurchaseResult = {
  purchase: PurchaseRecord;
  expense: ExpenseRecord | null;
  supplies: SupplyRecord[];
  movements: InventoryMovementRecord[];
};
type StockAdjustmentResult = {
  movement: InventoryMovementRecord;
  product: ProductRecord | null;
  supply: SupplyRecord | null;
};

const SALE_ORDER_SELECT =
  "id, sale_date, total_amount, payment_status, payment_method, paid_at, notes, created_at, contacts(name), sales_channels(name), sales_order_items(id, product_id, quantity, unit_price, line_total, products(name))";
const EXPENSE_SELECT =
  "id, expense_date, concept, amount, source, notes, linked_purchase_id, created_at, expense_categories(name), purchases(contacts(name))";
const PURCHASE_SELECT = "id, purchase_date, total_amount, notes, created_at, contacts(name)";
const PRODUCTION_BATCH_SELECT =
  "id, product_id, status, started_at, completed_at, expected_qty, actual_qty, notes, inventory_posted_at, created_at, products(name), production_batch_inputs(id, supply_id, quantity, supplies(name)), production_batch_outputs(id, product_id, quantity, products(name))";

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Tu sesion expiro. Volve a iniciar sesion.");
  }

  return { supabase, user };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? (value as RawRecord) : {};
}

function asArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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

function mapSale(record: RawRecord): SaleOrderRecord {
  const items = asArray(record.sales_order_items).map((item) => {
    const product = asRecord(item.products);

    return {
      id: String(item.id ?? ""),
      productId: String(item.product_id ?? ""),
      productName: String(product.name ?? "Producto"),
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      lineTotal: toNumber(item.line_total),
    };
  });
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
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
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

async function getContactRecord(supabase: SupabaseServerClient, contactId: string) {
  const { data, error } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapContact(asRecord(data)) : null;
}

async function getSupplyRecord(supabase: SupabaseServerClient, supplyId: string) {
  const { data, error } = await supabase
    .from("supply_inventory_overview")
    .select("*")
    .eq("id", supplyId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSupply(asRecord(data)) : null;
}

async function getProductRecord(supabase: SupabaseServerClient, productId: string) {
  const { data, error } = await supabase
    .from("product_inventory_overview")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProduct(asRecord(data)) : null;
}

async function getProductionBatchRecord(supabase: SupabaseServerClient, batchId: string) {
  const { data, error } = await supabase
    .from("production_batches")
    .select(PRODUCTION_BATCH_SELECT)
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapBatch(asRecord(data)) : null;
}

async function getSupplyRecords(supabase: SupabaseServerClient, supplyIds: string[]) {
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

  return (data ?? []).map((record) => mapSupply(asRecord(record)));
}

async function getSaleOrderRecord(supabase: SupabaseServerClient, saleOrderId: string) {
  const { data, error } = await supabase
    .from("sales_orders")
    .select(SALE_ORDER_SELECT)
    .eq("id", saleOrderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSale(asRecord(data)) : null;
}

async function getExpenseRecord(supabase: SupabaseServerClient, expenseId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("id", expenseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapExpense(asRecord(data)) : null;
}

async function getExpenseRecordByPurchaseId(supabase: SupabaseServerClient, purchaseId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("linked_purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapExpense(asRecord(data)) : null;
}

async function getPurchaseRecord(supabase: SupabaseServerClient, purchaseId: string) {
  const { data, error } = await supabase
    .from("purchases")
    .select(PURCHASE_SELECT)
    .eq("id", purchaseId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPurchase(asRecord(data)) : null;
}

async function getMovementRecord(supabase: SupabaseServerClient, movementId: string) {
  const { data, error } = await supabase
    .from("inventory_movement_details")
    .select("*")
    .eq("id", movementId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapInventoryMovement(asRecord(data)) : null;
}

async function getMovementRecordsByReference(
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

  return (data ?? []).map((record) => mapInventoryMovement(asRecord(record)));
}

async function updateContactRecord(
  supabase: SupabaseServerClient,
  contact: ContactRecord,
  nextValues: Pick<ContactRecord, "name" | "phone" | "email">,
) {
  const shouldUpdate =
    contact.name !== nextValues.name ||
    contact.phone !== nextValues.phone ||
    contact.email !== nextValues.email;

  if (!shouldUpdate) {
    return contact;
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({
      name: nextValues.name,
      phone: nextValues.phone,
      email: nextValues.email,
    })
    .eq("id", contact.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapContact(asRecord(data));
}

async function ensureAnonymousCustomer(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("type", "client")
    .eq("is_active", true)
    .ilike("name", ANONYMOUS_CUSTOMER_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return mapContact(asRecord(data));
  }

  const { data: created, error: createError } = await supabase
    .from("contacts")
    .insert({
      type: "client",
      name: ANONYMOUS_CUSTOMER_NAME,
      is_active: true,
    })
    .select("*")
    .single();

  if (createError) {
    throw createError;
  }

  return mapContact(asRecord(created));
}

async function resolveSaleContact(
  supabase: SupabaseServerClient,
  input: SaleOrderInput,
) {
  if (input.customerMode === "anonymous") {
    return ensureAnonymousCustomer(supabase);
  }

  if (input.customerMode === "existing" && input.contactId) {
    const existingContact = await getContactRecord(supabase, input.contactId);

    if (!existingContact || existingContact.type !== "client") {
      throw new Error("No encontramos el cliente seleccionado.");
    }

    return updateContactRecord(supabase, existingContact, {
      name: input.customerName ?? existingContact.name,
      phone: input.customerPhone ?? existingContact.phone,
      email: input.customerEmail ?? existingContact.email,
    });
  }

  const customerName = input.customerName?.trim();

  if (!customerName) {
    throw new Error("Ingresa el nombre del cliente.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("type", "client")
    .eq("is_active", true)
    .ilike("name", customerName)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return updateContactRecord(supabase, mapContact(asRecord(data)), {
      name: customerName,
      phone: input.customerPhone ?? ((data.phone as string | null | undefined) ?? null),
      email: input.customerEmail ?? ((data.email as string | null | undefined) ?? null),
    });
  }

  const { data: created, error: createError } = await supabase
    .from("contacts")
    .insert({
      type: "client",
      name: customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
      is_active: true,
    })
    .select("*")
    .single();

  if (createError) {
    throw createError;
  }

  return mapContact(asRecord(created));
}

function success<T = void>(message: string, data?: T): ActionResponse<T> {
  return data === undefined ? { success: true, message } : { success: true, message, data };
}

function failure<T = void>(message: string, error: unknown): ActionResponse<T> {
  return { success: false, message, error: getErrorMessage(error) };
}

function refreshTags(...tags: string[]) {
  tags.forEach((tag) => updateTag(tag));
}

export async function saveContactAction(input: unknown): Promise<ActionResponse<ContactRecord>> {
  const parsed = contactFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el contacto.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const payload = {
      type: data.type,
      name: data.name,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      is_active: data.isActive,
    };

    let contactId = id ?? null;

    if (id) {
      const { data: updatedContact, error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      contactId = String(updatedContact.id);
    } else {
      const { data: createdContact, error } = await supabase
        .from("contacts")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      contactId = String(createdContact.id);
    }

    if (!contactId) {
      throw new Error("No pudimos recuperar el contacto guardado.");
    }

    const contact = await getContactRecord(supabase, contactId);

    if (!contact) {
      throw new Error("No pudimos recuperar el contacto actualizado.");
    }

    refreshTags(CACHE_TAGS.contacts);
    revalidatePath("/contactos");
    revalidatePath("/ventas");
    revalidatePath("/insumos");
    return success("Contacto guardado.", contact);
  } catch (error) {
    return failure("No pudimos guardar el contacto.", error);
  }
}

export async function saveProductAction(input: unknown): Promise<ActionResponse<ProductRecord>> {
  const parsed = productFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el producto.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const payload = {
      name: data.name,
      category: data.category,
      unit: data.unit,
      sale_price: data.salePrice,
      min_stock: data.minStock,
      notes: data.notes,
      is_active: data.isActive,
    };

    let productId = id ?? null;

    if (id) {
      const { data: updatedProduct, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      productId = String(updatedProduct.id);
    } else {
      const { data: createdProduct, error } = await supabase
        .from("products")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      productId = String(createdProduct.id);
    }

    if (!productId) {
      throw new Error("No pudimos recuperar el producto guardado.");
    }

    const product = await getProductRecord(supabase, productId);

    if (!product) {
      throw new Error("No pudimos recuperar el producto actualizado.");
    }

    refreshTags(CACHE_TAGS.products);
    revalidatePath("/productos");
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Producto guardado.", product);
  } catch (error) {
    return failure("No pudimos guardar el producto.", error);
  }
}

export async function saveSupplyAction(input: unknown): Promise<ActionResponse<SupplyRecord>> {
  const parsed = supplyFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el insumo.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const payload = {
      name: data.name,
      unit: data.unit,
      min_stock: data.minStock,
      notes: data.notes,
      is_active: data.isActive,
    };

    let supplyId = id ?? null;

    if (id) {
      const { data: updatedSupply, error } = await supabase
        .from("supplies")
        .update(payload)
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      supplyId = String(updatedSupply.id);
    } else {
      const { data: createdSupply, error } = await supabase
        .from("supplies")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      supplyId = String(createdSupply.id);
    }

    if (!supplyId) {
      throw new Error("No pudimos recuperar el insumo guardado.");
    }

    const supply = await getSupplyRecord(supabase, supplyId);

    if (!supply) {
      throw new Error("No pudimos recuperar el insumo actualizado.");
    }

    refreshTags(CACHE_TAGS.supplies);
    revalidatePath("/insumos");
    revalidatePath("/dashboard");
    revalidatePath("/produccion");
    return success("Insumo guardado.", supply);
  } catch (error) {
    return failure("No pudimos guardar el insumo.", error);
  }
}

export async function createExpenseAction(input: unknown): Promise<ActionResponse<ExpenseRecord>> {
  const parsed = expenseFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar el gasto.", parsed.error);
  }

  try {
    const { supabase, user } = await getAuthenticatedClient();
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        concept: parsed.data.concept,
        expense_date: parsed.data.expenseDate,
        category_id: parsed.data.categoryId,
        amount: parsed.data.amount,
        notes: parsed.data.notes,
        source: "manual",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    const expense = await getExpenseRecord(supabase, String(data.id));

    if (!expense) {
      throw new Error("No pudimos recuperar el gasto actualizado.");
    }

    refreshTags(CACHE_TAGS.expenses);
    revalidatePath("/gastos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Gasto registrado.", expense);
  } catch (error) {
    return failure("No pudimos registrar el gasto.", error);
  }
}

export async function createSaleOrderAction(
  input: unknown,
): Promise<ActionResponse<CreateSaleOrderResult>> {
  const parsed = saleOrderFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar la venta.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const contact = await resolveSaleContact(supabase, parsed.data);
    const { data, error } = await supabase.rpc("create_sale_order", {
      payload: {
        contactId: contact.id,
        channelId: parsed.data.channelId,
        saleDate: parsed.data.saleDate,
        paymentStatus: parsed.data.paymentStatus,
        paymentMethod: parsed.data.paymentMethod,
        paidAt: parsed.data.paidAt,
        notes: parsed.data.notes,
        items: parsed.data.items,
      },
    });

    if (error) throw error;

    const sale = data?.id ? await getSaleOrderRecord(supabase, String(data.id)) : null;

    if (!sale) {
      throw new Error("La venta se guardo, pero no pudimos recuperar el detalle actualizado.");
    }

    refreshTags(
      CACHE_TAGS.sales,
      CACHE_TAGS.contacts,
      CACHE_TAGS.products,
      CACHE_TAGS.inventoryProduct,
    );
    revalidatePath("/ventas");
    revalidatePath("/contactos");
    revalidatePath("/dashboard");
    revalidatePath("/productos");
    revalidatePath("/reportes");
    return success("Venta registrada.", { sale, contact });
  } catch (error) {
    return failure("No pudimos registrar la venta.", error);
  }
}

export async function updateSalePaymentStatusAction(
  input: unknown,
): Promise<ActionResponse<SaleOrderRecord>> {
  const parsed = paymentStatusUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos actualizar el cobro.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase
      .from("sales_orders")
      .update({
        payment_status: parsed.data.paymentStatus,
        payment_method: parsed.data.paymentMethod,
        paid_at: parsed.data.paidAt,
      })
      .eq("id", parsed.data.saleOrderId);

    if (error) throw error;

    const sale = await getSaleOrderRecord(supabase, parsed.data.saleOrderId);

    if (!sale) {
      throw new Error("No pudimos recuperar la venta actualizada.");
    }

    refreshTags(CACHE_TAGS.sales);
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    return success("Estado de cobro actualizado.", sale);
  } catch (error) {
    return failure("No pudimos actualizar el cobro.", error);
  }
}

export async function registerSupplyPurchaseAction(
  input: unknown,
): Promise<ActionResponse<RegisterPurchaseResult>> {
  const parsed = purchaseFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar la compra.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("register_supply_purchase", {
      payload: {
        supplierId: parsed.data.supplierId,
        purchaseDate: parsed.data.purchaseDate,
        notes: parsed.data.notes,
        items: parsed.data.items,
      },
    });

    if (error) throw error;

    const purchaseId = data?.id ? String(data.id) : null;

    if (!purchaseId) {
      throw new Error("No pudimos recuperar la compra registrada.");
    }

    const [purchase, expense, updatedSupplies, movements] = await Promise.all([
      getPurchaseRecord(supabase, purchaseId),
      getExpenseRecordByPurchaseId(supabase, purchaseId),
      getSupplyRecords(
        supabase,
        parsed.data.items.map((item) => item.supplyId),
      ),
      getMovementRecordsByReference(supabase, "purchase", purchaseId),
    ]);

    if (!purchase) {
      throw new Error("No pudimos recuperar la compra actualizada.");
    }

    refreshTags(
      CACHE_TAGS.supplies,
      CACHE_TAGS.purchases,
      CACHE_TAGS.inventorySupply,
      CACHE_TAGS.expenses,
    );
    revalidatePath("/insumos");
    revalidatePath("/gastos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Compra registrada.", {
      purchase,
      expense,
      supplies: updatedSupplies,
      movements,
    });
  } catch (error) {
    return failure("No pudimos registrar la compra.", error);
  }
}

export async function saveProductionBatchAction(
  input: unknown,
): Promise<ActionResponse<ProductionBatchRecord>> {
  const parsed = productionBatchFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el lote.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("create_production_batch", {
      payload: {
        id: parsed.data.id,
        productId: parsed.data.productId,
        status: parsed.data.status,
        startedAt: parsed.data.startedAt,
        completedAt: parsed.data.completedAt,
        expectedQty: parsed.data.expectedQty,
        actualQty: parsed.data.actualQty,
        notes: parsed.data.notes,
        inputs: parsed.data.inputs,
        outputs: parsed.data.outputs,
      },
    });

    if (error) throw error;

    const batchId = data?.id ? String(data.id) : parsed.data.id ?? null;

    if (!batchId) {
      throw new Error("No pudimos recuperar el lote guardado.");
    }

    const batch = await getProductionBatchRecord(supabase, batchId);

    if (!batch) {
      throw new Error("No pudimos recuperar el lote actualizado.");
    }

    refreshTags(
      CACHE_TAGS.production,
      CACHE_TAGS.products,
      CACHE_TAGS.supplies,
      CACHE_TAGS.inventoryProduct,
      CACHE_TAGS.inventorySupply,
    );
    revalidatePath("/produccion");
    revalidatePath("/dashboard");
    revalidatePath("/insumos");
    revalidatePath("/productos");
    revalidatePath("/reportes");
    return success("Lote guardado.", batch);
  } catch (error) {
    return failure("No pudimos guardar el lote.", error);
  }
}

export async function applyStockAdjustmentAction(
  input: unknown,
): Promise<ActionResponse<StockAdjustmentResult>> {
  const parsed = stockAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos ajustar el stock.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("apply_stock_adjustment", {
      payload: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        quantity: parsed.data.quantity,
        notes: parsed.data.notes,
        movementDate: parsed.data.movementDate,
      },
    });

    if (error) throw error;

    const movementId = data?.id ? String(data.id) : null;

    if (!movementId) {
      throw new Error("No pudimos recuperar el movimiento de ajuste.");
    }

    const [movement, updatedProduct, updatedSupply] = await Promise.all([
      getMovementRecord(supabase, movementId),
      parsed.data.entityType === "product"
        ? getProductRecord(supabase, parsed.data.entityId)
        : Promise.resolve(null),
      parsed.data.entityType === "supply"
        ? getSupplyRecord(supabase, parsed.data.entityId)
        : Promise.resolve(null),
    ]);

    if (!movement) {
      throw new Error("No pudimos recuperar el detalle del ajuste.");
    }

    refreshTags(
      parsed.data.entityType === "product" ? CACHE_TAGS.products : CACHE_TAGS.supplies,
      parsed.data.entityType === "product"
        ? CACHE_TAGS.inventoryProduct
        : CACHE_TAGS.inventorySupply,
    );
    revalidatePath("/productos");
    revalidatePath("/insumos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Stock ajustado.", {
      movement,
      product: updatedProduct,
      supply: updatedSupply,
    });
  } catch (error) {
    return failure("No pudimos ajustar el stock.", error);
  }
}
