"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse } from "@/lib/domain";
import { averageCostCorrectionSchema, stockAdjustmentSchema } from "@/lib/validators";
import { getMovementRecord, getProductRecord, getSupplyRecord } from "./records";
import {
  failure,
  getAuthenticatedClient,
  getReturnedId,
  refreshTags,
  revalidatePaths,
  success,
  type StockAdjustmentResult,
} from "./shared";

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
        // Solo ajustes positivos; vacio = sin costo (la base no toca el costo promedio).
        unitCost: parsed.data.quantity > 0 ? parsed.data.unitCost : undefined,
        notes: parsed.data.notes,
        movementDate: parsed.data.movementDate,
      },
    });

    if (error) throw error;

    const movementId = getReturnedId(data);

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
    revalidatePaths("/productos", "/insumos", "/dashboard", "/reportes");
    return success("Stock ajustado.", {
      movement,
      product: updatedProduct,
      supply: updatedSupply,
    });
  } catch (error) {
    return failure("No pudimos ajustar el stock.", error);
  }
}

/** Correccion manual del costo promedio de un producto o insumo (la base exige admin y motivo). */
export async function setAverageCostAction(input: unknown): Promise<ActionResponse> {
  const parsed = averageCostCorrectionSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos corregir el costo promedio.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { error } = await supabase.rpc("set_average_cost", {
      payload: {
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        avgCost: parsed.data.avgCost,
        reason: parsed.data.reason,
      },
    });

    if (error) throw error;

    refreshTags(parsed.data.entityType === "product" ? CACHE_TAGS.products : CACHE_TAGS.supplies);
    revalidatePaths("/productos", "/insumos", "/dashboard", "/reportes");
    return success("Costo promedio corregido.");
  } catch (error) {
    return failure("No pudimos corregir el costo promedio.", error);
  }
}
