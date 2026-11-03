"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, BundleRecord, PriceTierRecord } from "@/lib/domain";
import { mapPriceTier } from "@/lib/mappers";
import { bundleFormSchema, bundleStatusSchema, priceTiersFormSchema } from "@/lib/validators";
import { getBundleRecord } from "./records";
import { failure, getAuthenticatedClient, getReturnedId, refreshTags, revalidatePaths, success } from "./shared";

export async function savePriceTiersAction(
  input: unknown,
): Promise<ActionResponse<PriceTierRecord[]>> {
  const parsed = priceTiersFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar las escalas de precio.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("save_price_tiers", {
      payload: {
        productId: parsed.data.productId,
        tiers: parsed.data.tiers.map((tier) => ({
          minQty: tier.minQty,
          unitPrice: tier.unitPrice,
        })),
      },
    });

    if (error) throw error;

    const tiers = (data ?? [])
      .map(mapPriceTier)
      .sort((left, right) => left.minQty - right.minQty);

    refreshTags(CACHE_TAGS.priceTiers);
    revalidatePaths("/productos", "/ventas");
    return success("Escalas de precio guardadas.", tiers);
  } catch (error) {
    return failure("No pudimos guardar las escalas de precio.", error);
  }
}

export async function saveBundleAction(input: unknown): Promise<ActionResponse<BundleRecord>> {
  const parsed = bundleFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el combo.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("upsert_bundle", {
      payload: {
        id: parsed.data.id,
        name: parsed.data.name,
        salePrice: parsed.data.salePrice,
        notes: parsed.data.notes,
        isActive: parsed.data.isActive,
        items: parsed.data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    });

    if (error) throw error;

    const bundleId = getReturnedId(data) ?? parsed.data.id ?? null;
    const bundle = bundleId ? await getBundleRecord(supabase, bundleId) : null;

    if (!bundle) {
      throw new Error("No pudimos recuperar el combo guardado.");
    }

    refreshTags(CACHE_TAGS.bundles);
    revalidatePaths("/productos", "/ventas");
    return success("Combo guardado.", bundle);
  } catch (error) {
    return failure("No pudimos guardar el combo.", error);
  }
}

export async function setBundleStatusAction(
  input: unknown,
): Promise<ActionResponse<BundleRecord>> {
  const parsed = bundleStatusSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos actualizar el combo.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const current = await getBundleRecord(supabase, parsed.data.id);

    if (!current) {
      throw new Error("No encontramos el combo seleccionado.");
    }

    const { error } = await supabase.rpc("upsert_bundle", {
      payload: {
        id: current.id,
        name: current.name,
        salePrice: current.salePrice,
        notes: current.notes,
        isActive: parsed.data.isActive,
        items: current.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    });

    if (error) throw error;

    const bundle = await getBundleRecord(supabase, current.id);

    if (!bundle) {
      throw new Error("No pudimos recuperar el combo actualizado.");
    }

    refreshTags(CACHE_TAGS.bundles);
    revalidatePaths("/productos", "/ventas");
    return success(parsed.data.isActive ? "Combo activado." : "Combo desactivado.", bundle);
  } catch (error) {
    return failure("No pudimos actualizar el combo.", error);
  }
}
