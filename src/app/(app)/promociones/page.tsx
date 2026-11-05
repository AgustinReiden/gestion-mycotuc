import { PromotionsShell } from "@/components/app/promotions-shell";
import { getPromotionsPageData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const data = await getPromotionsPageData();

  return <PromotionsShell {...data} />;
}
