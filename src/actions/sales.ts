"use server";

import type { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache";
import { ANONYMOUS_CUSTOMER_NAME } from "@/lib/constants";
import type { ActionResponse, ContactRecord, SaleOrderRecord } from "@/lib/domain";
import { mapContact } from "@/lib/mappers";
import { escapeLikePattern } from "@/lib/search";
import {
  paymentStatusUpdateSchema,
  reversalSchema,
  saleOrderFormSchema,
} from "@/lib/validators";
import {
  getContactRecord,
  getMovementRecordsByReference,
  getProductRecords,
  getSaleOrderRecord,
} from "./records";
import {
  failure,
  getAuthenticatedClient,
  getReturnedId,
  refreshTags,
  revalidatePaths,
  success,
  type CreateSaleOrderResult,
  type ReverseSaleOrderResult,
  type SupabaseServerClient,
} from "./shared";

type SaleOrderInput = z.output<typeof saleOrderFormSchema>;

function fillIfEmpty(current: string | null, incoming: string | null | undefined) {
  if (current && current.trim() !== "") {
    return current;
  }

  return incoming ?? current ?? null;
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

  const { data, error } = await supabase.rpc("upsert_contact", {
    payload: {
      id: contact.id,
      type: contact.type,
      name: nextValues.name,
      phone: nextValues.phone,
      email: nextValues.email,
      notes: contact.notes,
      isActive: contact.isActive,
    },
  });

  if (error) {
    throw error;
  }

  return mapContact(data);
}

async function ensureAnonymousCustomer(supabase: SupabaseServerClient) {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("type", "client")
    .eq("is_active", true)
    .ilike("name", escapeLikePattern(ANONYMOUS_CUSTOMER_NAME))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return mapContact(data);
  }

  const { data: created, error: createError } = await supabase.rpc("upsert_contact", {
    payload: {
      type: "client",
      name: ANONYMOUS_CUSTOMER_NAME,
      isActive: true,
    },
  });

  if (createError) {
    throw createError;
  }

  return mapContact(created);
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

    if (!existingContact || existingContact.type !== "client" || !existingContact.isActive) {
      throw new Error("No encontramos el cliente seleccionado.");
    }

    // No se pisan datos existentes: solo se completan teléfono/email que falten.
    return updateContactRecord(supabase, existingContact, {
      name: existingContact.name,
      phone: fillIfEmpty(existingContact.phone, input.customerPhone),
      email: fillIfEmpty(existingContact.email, input.customerEmail),
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
    .ilike("name", escapeLikePattern(customerName))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    // Cliente ya existente: se conserva su nombre y se completan solo los datos vacíos.
    return updateContactRecord(supabase, mapContact(data), {
      name: data.name,
      phone: fillIfEmpty(data.phone, input.customerPhone),
      email: fillIfEmpty(data.email, input.customerEmail),
    });
  }

  const { data: created, error: createError } = await supabase.rpc("upsert_contact", {
    payload: {
      type: "client",
      name: customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
      isActive: true,
    },
  });

  if (createError) {
    throw createError;
  }

  return mapContact(created);
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
        amountPaid: parsed.data.paymentStatus === "partial" ? parsed.data.amountPaid : null,
        notes: parsed.data.notes,
        items: parsed.data.items.map((item) =>
          item.bundleId
            ? { bundleId: item.bundleId, quantity: item.quantity, unitPrice: item.unitPrice ?? null }
            : { productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice ?? null },
        ),
      },
    });

    if (error) throw error;

    const saleId = getReturnedId(data);
    const sale = saleId ? await getSaleOrderRecord(supabase, saleId) : null;

    if (!sale) {
      throw new Error("La venta se guardó, pero no pudimos recuperar el detalle actualizado.");
    }

    refreshTags(
      CACHE_TAGS.sales,
      CACHE_TAGS.contacts,
      CACHE_TAGS.products,
      CACHE_TAGS.inventoryProduct,
    );
    revalidatePaths("/ventas", "/contactos", "/dashboard", "/productos", "/reportes");
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
    const { data, error } = await supabase.rpc("update_sale_payment_status", {
      payload: {
        saleOrderId: parsed.data.saleOrderId,
        payment_status: parsed.data.paymentStatus,
        paymentStatus: parsed.data.paymentStatus,
        paymentMethod: parsed.data.paymentMethod,
        paidAt: parsed.data.paidAt,
        amount: parsed.data.paymentStatus === "partial" ? parsed.data.amount : null,
      },
    });

    if (error) throw error;

    const saleId = getReturnedId(data) ?? parsed.data.saleOrderId;
    const sale = await getSaleOrderRecord(supabase, saleId);

    if (!sale) {
      throw new Error("No pudimos recuperar la venta actualizada.");
    }

    refreshTags(CACHE_TAGS.sales);
    revalidatePaths("/ventas", "/dashboard", "/reportes");
    return success(
      parsed.data.paymentStatus === "partial" ? "Cobro parcial registrado." : "Estado de cobro actualizado.",
      sale,
    );
  } catch (error) {
    return failure("No pudimos actualizar el cobro.", error);
  }
}

export async function reverseSaleOrderAction(
  input: unknown,
): Promise<ActionResponse<ReverseSaleOrderResult>> {
  const parsed = reversalSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos anular la venta.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("reverse_sale_order", {
      payload: {
        saleOrderId: parsed.data.id,
        reason: parsed.data.reason,
      },
    });

    if (error) throw error;

    const saleId = getReturnedId(data) ?? parsed.data.id;
    const sale = await getSaleOrderRecord(supabase, saleId);

    if (!sale) {
      throw new Error("No pudimos recuperar la venta anulada.");
    }

    const [movements, products] = await Promise.all([
      getMovementRecordsByReference(supabase, "sale_order_reversal", saleId),
      getProductRecords(
        supabase,
        sale.items.map((item) => item.productId),
      ),
    ]);

    refreshTags(CACHE_TAGS.sales, CACHE_TAGS.products, CACHE_TAGS.inventoryProduct);
    revalidatePaths("/ventas", "/productos", "/dashboard", "/reportes");
    return success("Venta anulada.", { sale, movements, products });
  } catch (error) {
    return failure("No pudimos anular la venta.", error);
  }
}
