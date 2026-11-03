"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, SupplyRecord } from "@/lib/domain";
import { purchaseFormSchema, reversalSchema, supplyFormSchema } from "@/lib/validators";
import {
  getExpenseRecordByPurchaseId,
  getMovementRecordsByReference,
  getPurchaseRecord,
  getSupplyRecord,
  getSupplyRecords,
} from "./records";
import {
  failure,
  getAuthenticatedClient,
  getReturnedId,
  refreshTags,
  revalidatePaths,
  success,
  type RegisterPurchaseResult,
  type ReversePurchaseResult,
} from "./shared";

export async function saveSupplyAction(input: unknown): Promise<ActionResponse<SupplyRecord>> {
  const parsed = supplyFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el insumo.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const { data: savedSupply, error } = await supabase.rpc("upsert_supply", {
      payload: {
        id,
        name: data.name,
        unit: data.unit,
        minStock: data.minStock,
        notes: data.notes,
        isActive: data.isActive,
      },
    });

    if (error) throw error;

    const supplyId = getReturnedId(savedSupply);

    if (!supplyId) {
      throw new Error("No pudimos recuperar el insumo guardado.");
    }

    const supply = await getSupplyRecord(supabase, supplyId);

    if (!supply) {
      throw new Error("No pudimos recuperar el insumo actualizado.");
    }

    refreshTags(CACHE_TAGS.supplies);
    revalidatePaths("/insumos", "/dashboard", "/produccion");
    return success("Insumo guardado.", supply);
  } catch (error) {
    return failure("No pudimos guardar el insumo.", error);
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

    const purchaseId = getReturnedId(data);

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
    revalidatePaths("/insumos", "/gastos", "/dashboard", "/reportes");
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

export async function reverseSupplyPurchaseAction(
  input: unknown,
): Promise<ActionResponse<ReversePurchaseResult>> {
  const parsed = reversalSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos anular la compra.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("reverse_supply_purchase", {
      payload: {
        purchaseId: parsed.data.id,
        reason: parsed.data.reason,
      },
    });

    if (error) throw error;

    const purchaseId = getReturnedId(data) ?? parsed.data.id;
    const [purchase, expense, movements] = await Promise.all([
      getPurchaseRecord(supabase, purchaseId),
      getExpenseRecordByPurchaseId(supabase, purchaseId),
      getMovementRecordsByReference(supabase, "purchase_reversal", purchaseId),
    ]);

    if (!purchase) {
      throw new Error("No pudimos recuperar la compra anulada.");
    }

    const supplies = await getSupplyRecords(
      supabase,
      movements.map((movement) => movement.entityId),
    );

    refreshTags(
      CACHE_TAGS.supplies,
      CACHE_TAGS.purchases,
      CACHE_TAGS.inventorySupply,
      CACHE_TAGS.expenses,
    );
    revalidatePaths("/insumos", "/gastos", "/dashboard", "/reportes");
    return success("Compra anulada.", {
      purchase,
      expense,
      supplies,
      movements,
    });
  } catch (error) {
    return failure("No pudimos anular la compra.", error);
  }
}
