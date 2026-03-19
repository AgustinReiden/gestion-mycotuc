import { ReportsShell } from "@/components/app/reports-shell";
import { getReportData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getReportData();

  return <ReportsShell {...data} />;
}
