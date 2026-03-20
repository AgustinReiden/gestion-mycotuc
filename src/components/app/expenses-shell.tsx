"use client";

import { useDeferredValue, useState } from "react";
import { Plus, ReceiptText, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { ExpenseForm } from "@/components/forms/expense-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ExpenseRecord, LookupOption } from "@/lib/domain";
import { formatCurrency, formatDate, sumBy } from "@/lib/utils";

type ExpensesShellProps = {
  expenses: ExpenseRecord[];
  categories: LookupOption[];
};

function NewExpenseModal({ categories }: { categories: LookupOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo gasto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar gasto" description="Los gastos manuales impactan en los reportes y el dashboard financiero.">
        <ExpenseForm categories={categories} onSuccess={() => { setOpen(false); router.refresh(); }} />
      </Modal>
    </>
  );
}

export function ExpensesShell({ expenses, categories }: ExpensesShellProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const filteredExpenses = expenses.filter((expense) => {
    const query = deferredSearch.toLowerCase();
    return (
      expense.concept.toLowerCase().includes(query) ||
      expense.categoryName?.toLowerCase().includes(query) ||
      expense.supplierName?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="page-grid">
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Gastos</p>
              <h2 className="mt-2 text-3xl font-semibold">Flujo financiero de salida</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Combina gastos manuales y compras de insumos con una sola lectura financiera.
              </p>
            </div>
            <NewExpenseModal categories={categories} />
          </div>
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          <div>
            <p className="text-sm text-[var(--muted)]">Total registrado</p>
            <p className="mt-2 text-3xl font-semibold text-[#934534]">
              {formatCurrency(sumBy(expenses, (expense) => expense.amount))}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Compras de insumos</p>
            <p className="mt-2 text-2xl font-semibold">
              {expenses.filter((expense) => expense.source === "purchase").length}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Gastos manuales</p>
            <p className="mt-2 text-2xl font-semibold">
              {expenses.filter((expense) => expense.source === "manual").length}
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por concepto, categoria o proveedor..."
            className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
          />
        </label>

        <div className="mt-5 overflow-hidden rounded-[26px] border border-[var(--line)]">
          {filteredExpenses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No hay gastos para este filtro"
                description="Carga un gasto manual o registra una compra de insumos."
                icon={ReceiptText}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f4f1e8] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Origen</th>
                    <th className="px-4 py-3 font-medium">Proveedor</th>
                    <th className="px-4 py-3 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-t border-[var(--line)] bg-white/80">
                      <td className="px-4 py-4">{formatDate(expense.expenseDate)}</td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{expense.concept}</p>
                        {expense.notes ? <p className="text-xs text-[var(--muted)]">{expense.notes}</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <Badge>{expense.categoryName ?? "Sin categoria"}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={expense.source === "purchase" ? "accent" : "neutral"}>
                          {expense.source === "purchase" ? "Compra" : "Manual"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">{expense.supplierName ?? "-"}</td>
                      <td className="px-4 py-4 font-semibold text-[#934534]">{formatCurrency(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
