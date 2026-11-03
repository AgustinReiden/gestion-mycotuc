"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, ProductionBatchRecord } from "@/lib/domain";
import { productionBatchFormSchema, reversalSchema } from "@/lib/validators";
import {
  getMovementRecordsByReference,
  getProductRecords,
  getProductionBatchRecord,
  getSupplyRecords,
} from "./records";
import {
  failure,
  getAuthenticatedClient,
  getReturnedId,
  refreshTags,
  revalidatePaths,
  success,
  type ReverseProductionBatchResult,
} from "./shared";

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

    const batchId = getReturnedId(data) ?? parsed.data.id ?? null;

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
    revalidatePaths("/produccion", "/dashboard", "/insumos", "/productos", "/reportes");
    return success("Lote guardado.", batch);
  } catch (error) {
    return failure("No pudimos guardar el lote.", error);
  }
}

export async function reverseProductionBatchAction(
  input: unknown,
): Promise<ActionResponse<ReverseProductionBatchResult>> {
  const parsed = reversalSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos anular el lote.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("reverse_production_batch", {
      payload: {
        batchId: parsed.data.id,
        reason: parsed.data.reason,
      },
    });

    if (error) throw error;

    const batchId = getReturnedId(data) ?? parsed.data.id;
    const batch = await getProductionBatchRecord(supabase, batchId);

    if (!batch) {
      throw new Error("No pudimos recuperar el lote anulado.");
    }

    const [movements, products, supplies] = await Promise.all([
      getMovementRecordsByReference(supabase, "production_batch_reversal", batchId),
      getProductRecords(
        supabase,
        batch.outputs.map((output) => output.productId),
      ),
      getSupplyRecords(
        supabase,
        batch.inputs.map((input) => input.supplyId),
      ),
    ]);

    refreshTags(
      CACHE_TAGS.production,
      CACHE_TAGS.products,
      CACHE_TAGS.supplies,
      CACHE_TAGS.inventoryProduct,
      CACHE_TAGS.inventorySupply,
    );
    revalidatePaths("/produccion", "/dashboard", "/insumos", "/productos", "/reportes");
    return success("Lote anulado.", {
      batch,
      movements,
      products,
      supplies,
    });
  } catch (error) {
    return failure("No pudimos anular el lote.", error);
  }
}
