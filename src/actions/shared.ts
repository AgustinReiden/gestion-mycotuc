import { revalidatePath, updateTag } from "next/cache";
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

/**
 * Modulo compartido por las server actions de src/actions. No lleva "use server":
 * solo los archivos por dominio (las acciones) se exponen como endpoints.
 */

export type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CreateSaleOrderResult = {
  sale: SaleOrderRecord;
  contact: ContactRecord;
};
export type RegisterPurchaseResult = {
  purchase: PurchaseRecord;
  expense: ExpenseRecord | null;
  supplies: SupplyRecord[];
  movements: InventoryMovementRecord[];
};
export type ReversePurchaseResult = RegisterPurchaseResult;
export type ReverseSaleOrderResult = {
  sale: SaleOrderRecord;
  movements: InventoryMovementRecord[];
  products: ProductRecord[];
};
export type ReverseProductionBatchResult = {
  batch: ProductionBatchRecord;
  movements: InventoryMovementRecord[];
  products: ProductRecord[];
  supplies: SupplyRecord[];
};
export type StockAdjustmentResult = {
  movement: InventoryMovementRecord;
  product: ProductRecord | null;
  supply: SupplyRecord | null;
};

export async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");
  }

  return { supabase, user };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  // supabase-js devuelve los errores de rpc()/from() como objetos planos ({ message, code, ... }),
  // no como instancias de Error: sin esto, cualquier error de la base se veía como "inesperado".
  if (error && typeof error === "object") {
    const { message } = error as { message?: unknown };

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "Ocurrió un error inesperado.";
}

/** Id de la fila que devuelve una RPC (o null si no vino). */
export function getReturnedId(value: { id?: string | null } | null | undefined) {
  return value?.id ? String(value.id) : null;
}

export function success<T = void>(message: string, data?: T): ActionResponse<T> {
  return data === undefined ? { success: true, message } : { success: true, message, data };
}

export function failure<T = void>(message: string, error: unknown): ActionResponse<T> {
  return { success: false, message, error: getErrorMessage(error) };
}

export function refreshTags(...tags: string[]) {
  tags.forEach((tag) => updateTag(tag));
}

export function revalidatePaths(...paths: string[]) {
  paths.forEach((path) => revalidatePath(path));
}
