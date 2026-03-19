import { SuppliesShell } from "@/components/app/supplies-shell";
import { getSuppliesPageData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SuppliesPage() {
  const data = await getSuppliesPageData();

  return <SuppliesShell {...data} />;
}
