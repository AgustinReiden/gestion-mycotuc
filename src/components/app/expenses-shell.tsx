"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Plus, ReceiptText, Search } from "lucide-react";
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
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

  useEffect(() => {
    setExpenseRecords(sortExpenses(expenses));
  }, [expenses]);

  const filteredExpenses = expenseRecords.filter((expense) => {
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
            <NewExpenseModal
              categories={categories}
              onExpenseCreated={(expense) => {
                setExpenseRecords((current) => upsertExpense(current, expense));
              }}
            />
          </div>
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          <div>
            <p className="text-sm text-[var(--muted)]">Total registrado</p>
            <p className="mt-2 text-3xl font-semibold text-[#934534]">
              {formatCurrency(sumBy(expenseRecords, (expense) => expense.amount))}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Compras de insumos</p>
            <p className="mt-2 text-2xl font-semibold">
              {expenseRecords.filter((expense) => expense.source === "purchase").length}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Gastos manuales</p>
            <p className="mt-2 text-2xl font-semibold">
              {expenseRecords.filter((expense) => expense.source === "manual").length}
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <label className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
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
            <>
              <div className="divide-y divide-[var(--line)] md:hidden">
                {filteredExpenses.map((expense) => (
                  <article key={expense.id} className="space-y-4 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">
                          {formatDate(expense.expenseDate)}
                        </p>
                        <h3 className="mt-2 font-semibold">{expense.concept}</h3>
                        {expense.notes ? (
                          <p className="mt-1 text-sm text-[var(--muted)]">{expense.notes}</p>
                        ) : null}
                      </div>
                      <p className="text-lg font-semibold text-[#934534]">
                        {formatCurrency(expense.amount)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge>{expense.categoryName ?? "Sin categoria"}</Badge>
                      <Badge tone={expense.source === "purchase" ? "accent" : "neutral"}>
                        {expense.source === "purchase" ? "Compra" : "Manual"}
                      </Badge>
                    </div>

                    <div className="rounded-[22px] border border-[var(--line)] bg-[#f8f6ef] p-4 text-sm text-[var(--muted)]">
                      <p>Proveedor: {expense.supplierName ?? "-"}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
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
                          {expense.notes ? (
                            <p className="text-xs text-[var(--muted)]">{expense.notes}</p>
                          ) : null}
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
                        <td className="px-4 py-4 font-semibold text-[#934534]">
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
      </Panel>
    </div>
  );
}
