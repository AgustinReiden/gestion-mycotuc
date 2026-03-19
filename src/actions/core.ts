"use server";

import { revalidatePath } from "next/cache";
import type { ActionResponse } from "@/lib/domain";
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

function success(message: string): ActionResponse {
  return { success: true, message };
}

function failure(message: string, error: unknown): ActionResponse {
  return { success: false, message, error: getErrorMessage(error) };
}

export async function saveContactAction(input: unknown): Promise<ActionResponse> {
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

    if (id) {
      const { error } = await supabase.from("contacts").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("contacts").insert(payload);
      if (error) throw error;
    }

    revalidatePath("/contactos");
    revalidatePath("/ventas");
    revalidatePath("/insumos");
    return success("Contacto guardado.");
  } catch (error) {
    return failure("No pudimos guardar el contacto.", error);
  }
}

export async function saveProductAction(input: unknown): Promise<ActionResponse> {
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

    if (id) {
      const { error } = await supabase.from("products").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;
    }

    revalidatePath("/productos");
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Producto guardado.");
  } catch (error) {
    return failure("No pudimos guardar el producto.", error);
  }
}

export async function saveSupplyAction(input: unknown): Promise<ActionResponse> {
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

    if (id) {
      const { error } = await supabase.from("supplies").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("supplies").insert(payload);
      if (error) throw error;
    }

    revalidatePath("/insumos");
    revalidatePath("/dashboard");
    revalidatePath("/produccion");
    return success("Insumo guardado.");
  } catch (error) {
    return failure("No pudimos guardar el insumo.", error);
  }
}

export async function createExpenseAction(input: unknown): Promise<ActionResponse> {
  const parsed = expenseFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar el gasto.", parsed.error);
  }

  try {
    const { supabase, user } = await getAuthenticatedClient();
    const { error } = await supabase.from("expenses").insert({
      concept: parsed.data.concept,
      expense_date: parsed.data.expenseDate,
      category_id: parsed.data.categoryId,
      amount: parsed.data.amount,
      notes: parsed.data.notes,
      source: "manual",
      created_by: user.id,
    });

    if (error) throw error;

    revalidatePath("/gastos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Gasto registrado.");
  } catch (error) {
    return failure("No pudimos registrar el gasto.", error);
  }
}

export async function createSaleOrderAction(input: unknown): Promise<ActionResponse> {
  const parsed = saleOrderFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar la venta.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase.rpc("create_sale_order", {
      payload: {
        contactId: parsed.data.contactId,
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

    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/productos");
    revalidatePath("/reportes");
    return success("Venta registrada.");
  } catch (error) {
    return failure("No pudimos registrar la venta.", error);
  }
}

export async function updateSalePaymentStatusAction(input: unknown): Promise<ActionResponse> {
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

    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    return success("Estado de cobro actualizado.");
  } catch (error) {
    return failure("No pudimos actualizar el cobro.", error);
  }
}

export async function registerSupplyPurchaseAction(input: unknown): Promise<ActionResponse> {
  const parsed = purchaseFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar la compra.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase.rpc("register_supply_purchase", {
      payload: {
        supplierId: parsed.data.supplierId,
        purchaseDate: parsed.data.purchaseDate,
        notes: parsed.data.notes,
        items: parsed.data.items,
      },
    });

    if (error) throw error;

    revalidatePath("/insumos");
    revalidatePath("/gastos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Compra registrada.");
  } catch (error) {
    return failure("No pudimos registrar la compra.", error);
  }
}

export async function saveProductionBatchAction(input: unknown): Promise<ActionResponse> {
  const parsed = productionBatchFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el lote.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase.rpc("create_production_batch", {
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

    revalidatePath("/produccion");
    revalidatePath("/dashboard");
    revalidatePath("/insumos");
    revalidatePath("/productos");
    revalidatePath("/reportes");
    return success("Lote guardado.");
  } catch (error) {
    return failure("No pudimos guardar el lote.", error);
  }
}

export async function applyStockAdjustmentAction(input: unknown): Promise<ActionResponse> {
  const parsed = stockAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos ajustar el stock.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase.rpc("apply_stock_adjustment", {
      payload: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        quantity: parsed.data.quantity,
        notes: parsed.data.notes,
        movementDate: parsed.data.movementDate,
      },
    });

    if (error) throw error;

    revalidatePath("/productos");
    revalidatePath("/insumos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return success("Stock ajustado.");
  } catch (error) {
    return failure("No pudimos ajustar el stock.", error);
  }
}
