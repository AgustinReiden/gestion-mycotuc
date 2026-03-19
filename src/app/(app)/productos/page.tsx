import { ProductsShell } from "@/components/app/products-shell";
import { getProductsPageData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const data = await getProductsPageData();

  return <ProductsShell {...data} />;
}
