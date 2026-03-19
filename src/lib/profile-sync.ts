import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export async function ensureProfileForUser(supabase: SupabaseClient<Database>): Promise<ProfileRow | null> {
  const { data, error } = await supabase.rpc("ensure_current_user_profile");

  if (error) {
    return null;
  }

  return data ?? null;
}
