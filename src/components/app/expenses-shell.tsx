"use client";

import { useDeferredValue, useState } from "react";
import { Plus, ReceiptText, Search } from "lucide-react";
import { ExpenseForm } from "@/components/forms/expense-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ExpenseRecord, LookupOption } from "@/lib/domain";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import { formatCurrency, formatDate, sumBy } from "@/lib/utils";

type ExpensesShellProps = {
  expenses: ExpenseRecord[];
  categories: LookupOption[];
};

function sortExpenses(list: ExpenseRecord[]) {
  return [...list].sort((left, right) => {
    const expenseDateComparison = right.expenseDate.localeCompare(left.expenseDate);

    if (expenseDateComparison !== 0) {
      return expenseDateComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function upsertExpense(list: ExpenseRecord[], expense: ExpenseRecord) {
  return sortExpenses([expense, ...list.filter((entry) => entry.id !== expense.id)]);
}

function NewExpenseModal({
  categories,
  onExpenseCreated,
}: {
  categories: LookupOption[];
  onExpenseCreated: (expense: ExpenseRecord) => void;
}) {
  const [open, setOpen] = useQuickCreate("gasto");

  return (
    <>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
        Nuevo gasto
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar gasto"
        description="Los gastos manuales impactan en los reportes y el dashboard financiero."
      >
        <ExpenseForm
          categories={categories}
          onSuccess={(expense) => {
            setOpen(false);
            onExpenseCreated(expense);
          }}
        />
      </Modal>
    </>
  );
}

export function ExpensesShell({ expenses, categories }: ExpensesShellProps) {
  const [search, setSearch] = useState("");
  const [expenseRecords, setExpenseRecords] = useState(() => sortExpenses(expenses));
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedExpenses, setSyncedExpenses] = useState(expenses);
  if (syncedExpenses !== expenses) {
    setSyncedExpenses(expenses);
    setExpenseRecords(sortExpenses(expenses));
  }

  const filteredExpenses = expenseRecords.filter((expense) => {
    const query = deferredSearch.toLowerCase();
    return (
      expense.concept.toLowerCase().includes(query) ||
      expense.categoryName?.toLowerCase().includes(query) ||
      expense.supplierName?.toLowerCase().includes(query)
    );
  });
  const activeExpenses = expenseRecords.filter((expense) => !expense.isVoided);

  return (
    <div className="page-grid">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid grid-cols-2 gap-3 md:max-w-xl">
          <Panel className="col-span-2 p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Total registrado</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">
              {formatCurrency(sumBy(activeExpenses, (expense) => expense.amount))}
            </p>
          </Panel>
          <Panel className="p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Compras de insumos</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">
              {activeExpenses.filter((expense) => expense.source === "purchase").length}
            </p>
          </Panel>
          <Panel className="p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Gastos manuales</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">
              {activeExpenses.filter((expense) => expense.source === "manual").length}
            </p>
          </Panel>
        </div>
        <NewExpenseModal
          categories={categories}
          onExpenseCreated={(expense) => {
            setExpenseRecords((current) => upsertExpense(current, expense));
          }}
        />
      </div>

      <div className="grid gap-3">
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar concepto, categoría o proveedor"
            aria-label="Buscar gastos"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
          />
        </label>

        <div>
          {filteredExpenses.length === 0 ? (
            <div>
              <EmptyState
                title={hasSearchQuery ? "No encontramos gastos" : "Todavía no hay gastos"}
                description={
                  hasSearchQuery
                    ? "Probá con otro término de búsqueda o registrá un nuevo gasto."
                    : "Cargá un gasto manual o registrá una compra de insumos para empezar a ver movimientos."
                }
                icon={ReceiptText}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {filteredExpenses.map((expense) => (
                  <article key={expense.id} className="space-y-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-[var(--muted)]">
                          {formatDate(expense.expenseDate)}
                        </p>
                        <h3 className="mt-0.5 text-base font-semibold">{expense.concept}</h3>
                        {expense.notes ? (
                          <p className="mt-1 text-sm text-[var(--muted)]">{expense.notes}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums">
                        {formatCurrency(expense.amount)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge>{expense.categoryName ?? "Sin categoría"}</Badge>
                      <Badge tone={expense.source === "purchase" ? "accent" : "neutral"}>
                        {expense.source === "purchase" ? "Compra" : "Manual"}
                      </Badge>
                      {expense.isVoided ? <Badge tone="danger">Anulado</Badge> : null}
                    </div>

                    {expense.supplierName ? (
                      <p className="text-sm text-[var(--muted)]">Proveedor: {expense.supplierName}</p>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Concepto</th>
                      <th className="px-4 py-3 font-medium">Categoría</th>
                      <th className="px-4 py-3 font-medium">Origen</th>
                      <th className="px-4 py-3 font-medium">Proveedor</th>
                      <th className="px-4 py-3 font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => (
                      <tr key={expense.id} className="border-t border-[var(--line)] bg-[var(--surface)]">
                        <td className="px-4 py-4">{formatDate(expense.expenseDate)}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold">{expense.concept}</p>
                          {expense.notes ? (
                            <p className="text-xs text-[var(--muted)]">{expense.notes}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <Badge>{expense.categoryName ?? "Sin categoría"}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={expense.source === "purchase" ? "accent" : "neutral"}>
                            {expense.source === "purchase" ? "Compra" : "Manual"}
                          </Badge>
                          {expense.isVoided ? <Badge tone="danger">Anulado</Badge> : null}
                        </td>
                        <td className="px-4 py-4">{expense.supplierName ?? "-"}</td>
                        <td className="px-4 py-4 font-semibold tabular-nums">
                          {formatCurrency(expense.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
