import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileSummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileSummary();

  if (!profile) {
    redirect("/login");
  }

  return <AppShell profile={profile}>{children}</AppShell>;
}
