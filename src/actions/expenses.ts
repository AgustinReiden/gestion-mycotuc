"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, ExpenseRecord } from "@/lib/domain";
import { expenseFormSchema } from "@/lib/validators";
import { getExpenseRecord } from "./records";
import { failure, getAuthenticatedClient, getReturnedId, refreshTags, revalidatePaths, success } from "./shared";

export async function createExpenseAction(input: unknown): Promise<ActionResponse<ExpenseRecord>> {
  const parsed = expenseFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos registrar el gasto.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { data, error } = await supabase.rpc("create_manual_expense", {
      payload: {
        concept: parsed.data.concept,
        expenseDate: parsed.data.expenseDate,
        categoryId: parsed.data.categoryId,
        amount: parsed.data.amount,
        notes: parsed.data.notes,
      },
    });

    if (error) throw error;

    const expenseId = getReturnedId(data);

    if (!expenseId) {
      throw new Error("No pudimos recuperar el gasto registrado.");
    }

    const expense = await getExpenseRecord(supabase, expenseId);

    if (!expense) {
      throw new Error("No pudimos recuperar el gasto actualizado.");
    }

    refreshTags(CACHE_TAGS.expenses);
    revalidatePaths("/gastos", "/dashboard", "/reportes");
    return success("Gasto registrado.", expense);
  } catch (error) {
    return failure("No pudimos registrar el gasto.", error);
  }
}
