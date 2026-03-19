import { ExpensesShell } from "@/components/app/expenses-shell";
import { getExpensesData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const data = await getExpensesData();

  return <ExpensesShell {...data} />;
}
