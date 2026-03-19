"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResponse } from "@/lib/domain";
import { ensureProfileForUser } from "@/lib/profile-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validators";

export async function loginAction(input: unknown): Promise<ActionResponse> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      message: "No pudimos iniciar sesion.",
      error: parsed.error.issues[0]?.message ?? "Credenciales invalidas.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      success: false,
      message: "No pudimos iniciar sesion.",
      error: error.message,
    };
  }

  if (data.user) {
    await ensureProfileForUser(supabase);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
