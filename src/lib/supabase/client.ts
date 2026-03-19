"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseEnv();
    browserClient = createBrowserClient<Database>(url, anonKey);
  }

  return browserClient;
}
