import { ProductionShell } from "@/components/app/production-shell";
import { getProductionData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const data = await getProductionData();

  return <ProductionShell {...data} />;
}
