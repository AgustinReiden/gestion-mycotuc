"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type {
  ActionResponse,
  BundleRecord,
  CategoryScaleRecord,
  PriceTierRecord,
  ProductCategoryRecord,
} from "@/lib/domain";
import { mapPriceTier, mapProductCategory } from "@/lib/mappers";
import {
  bundleFormSchema,
  bundleStatusSchema,
  categoryScaleFormSchema,
  categoryScaleStatusSchema,
  priceTiersFormSchema,
  productCategoryFormSchema,
} from "@/lib/validators";
import { getBundleRecord, getCategoryScaleRecord } from "./records";
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
    revalidatePaths("/productos", "/ventas", "/promociones");
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
    revalidatePaths("/productos", "/ventas", "/promociones");
    return success(parsed.data.isActive ? "Combo activado." : "Combo desactivado.", bundle);
  } catch (error) {
    return failure("No pudimos actualizar el combo.", error);
  }
}

export async function saveCategoryScaleAction(
  input: unknown,
): Promise<ActionResponse<CategoryScaleRecord>> {
  const parsed = categoryScaleFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar la escala.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("save_category_price_scale", {
      payload: {
        id: parsed.data.id,
        categoryId: parsed.data.categoryId,
        isActive: parsed.data.isActive,
        excludedProductIds: parsed.data.excludedProductIds,
        tiers: parsed.data.tiers.map((tier) => ({
          minQty: tier.minQty,
          price: tier.price,
          mode: tier.mode,
        })),
      },
    });

    if (error) throw error;

    const scaleId = getReturnedId(data) ?? parsed.data.id ?? null;
    const scale = scaleId ? await getCategoryScaleRecord(supabase, scaleId) : null;

    if (!scale) {
      throw new Error("No pudimos recuperar la escala guardada.");
    }

    refreshTags(CACHE_TAGS.categoryScales);
    revalidatePaths("/promociones", "/ventas");
    return success("Escala guardada.", scale);
  } catch (error) {
    return failure("No pudimos guardar la escala.", error);
  }
}

export async function setCategoryScaleStatusAction(
  input: unknown,
): Promise<ActionResponse<CategoryScaleRecord>> {
  const parsed = categoryScaleStatusSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos actualizar la escala.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const current = await getCategoryScaleRecord(supabase, parsed.data.id);

    if (!current) {
      throw new Error("No encontramos la escala seleccionada.");
    }

    const { error } = await supabase.rpc("save_category_price_scale", {
      payload: {
        id: current.id,
        categoryId: current.categoryId,
        isActive: parsed.data.isActive,
        excludedProductIds: current.excludedProductIds,
        tiers: current.tiers.map((tier) => ({
          minQty: tier.minQty,
          price: tier.price,
          mode: tier.mode,
        })),
      },
    });

    if (error) throw error;

    const scale = await getCategoryScaleRecord(supabase, current.id);

    if (!scale) {
      throw new Error("No pudimos recuperar la escala actualizada.");
    }

    refreshTags(CACHE_TAGS.categoryScales);
    revalidatePaths("/promociones", "/ventas");
    return success(parsed.data.isActive ? "Escala activada." : "Escala desactivada.", scale);
  } catch (error) {
    return failure("No pudimos actualizar la escala.", error);
  }
}

export async function saveProductCategoryAction(
  input: unknown,
): Promise<ActionResponse<ProductCategoryRecord>> {
  const parsed = productCategoryFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar la categoría.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("save_product_category", {
      payload: {
        id: parsed.data.id,
        name: parsed.data.name,
        isActive: parsed.data.isActive,
      },
    });

    if (error) throw error;

    refreshTags(CACHE_TAGS.categories, CACHE_TAGS.products, CACHE_TAGS.categoryScales);
    revalidatePaths("/productos", "/ventas", "/promociones");
    return success("Categoría guardada.", mapProductCategory(data));
  } catch (error) {
    return failure("No pudimos guardar la categoría.", error);
  }
}
