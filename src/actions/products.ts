"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, ProductRecord } from "@/lib/domain";
import { productFormSchema } from "@/lib/validators";
import { getProductRecord } from "./records";
import { failure, getAuthenticatedClient, getReturnedId, refreshTags, revalidatePaths, success } from "./shared";

export async function saveProductAction(input: unknown): Promise<ActionResponse<ProductRecord>> {
  const parsed = productFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el producto.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const { data: savedProduct, error } = await supabase.rpc("upsert_product", {
      payload: {
        id,
        name: data.name,
        category: data.category,
        unit: data.unit,
        salePrice: data.salePrice,
        minStock: data.minStock,
        notes: data.notes,
        isActive: data.isActive,
      },
    });

    if (error) throw error;

    const productId = getReturnedId(savedProduct);

    if (!productId) {
      throw new Error("No pudimos recuperar el producto guardado.");
    }

    const product = await getProductRecord(supabase, productId);

    if (!product) {
      throw new Error("No pudimos recuperar el producto actualizado.");
    }

    refreshTags(CACHE_TAGS.products);
    revalidatePaths("/productos", "/ventas", "/dashboard", "/reportes");
    return success("Producto guardado.", product);
  } catch (error) {
    return failure("No pudimos guardar el producto.", error);
  }
}
