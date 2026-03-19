import { SalesShell } from "@/components/app/sales-shell";
import { getSalesData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const data = await getSalesData();

  return <SalesShell {...data} />;
}
