"use client";

import { useState } from "react";
import { BarChart3, CircleAlert, Package, Sprout } from "lucide-react";
import { ActionNotice } from "@/components/forms/action-notice";
import { Panel } from "@/components/ui/panel";
import type { ExpenseRecord, ProductRecord, ProductionBatchRecord, SaleOrderRecord, SupplyRecord } from "@/lib/domain";
import { formatCurrency, sumBy } from "@/lib/utils";

type ReportsShellProps = {
  sales: SaleOrderRecord[];
  expenses: ExpenseRecord[];
  products: ProductRecord[];
  supplies: SupplyRecord[];
  batches: ProductionBatchRecord[];
};

type RangeFilter = {
  from: string;
  to: string;
};

function inRange(date: string, range: RangeFilter) {
  return date >= range.from && date <= range.to;
}

function normalizeRange(range: RangeFilter): RangeFilter {
  if (range.from <= range.to) {
    return range;
  }

  return {
    from: range.to,
    to: range.from,
  };
}

export function ReportsShell({ sales, expenses, products, supplies, batches }: ReportsShellProps) {
  const [range, setRange] = useState<RangeFilter>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const hasInvalidRange = range.from > range.to;
  const effectiveRange = normalizeRange(range);

  const filteredSales = sales.filter((sale) => inRange(sale.saleDate, effectiveRange));
  const filteredExpenses = expenses.filter((expense) => inRange(expense.expenseDate, effectiveRange));
  const filteredBatches = batches.filter((batch) => inRange(batch.startedAt, effectiveRange));

  const salesByProduct = new Map<string, number>();
  filteredSales.forEach((sale) => {
    sale.items.forEach((item) => {
      salesByProduct.set(item.productName, (salesByProduct.get(item.productName) ?? 0) + item.lineTotal);
    });
  });

  const salesByChannel = new Map<string, number>();
  filteredSales.forEach((sale) => {
    salesByChannel.set(sale.channelName ?? "Sin canal", (salesByChannel.get(sale.channelName ?? "Sin canal") ?? 0) + sale.totalAmount);
  });

  const expensesByCategory = new Map<string, number>();
  filteredExpenses.forEach((expense) => {
    expensesByCategory.set(expense.categoryName ?? "Sin categoria", (expensesByCategory.get(expense.categoryName ?? "Sin categoria") ?? 0) + expense.amount);
  });

  const totalSales = sumBy(filteredSales, (sale) => sale.totalAmount);
  const totalExpenses = sumBy(filteredExpenses, (expense) => expense.amount);

  const criticalStock = [...products, ...supplies].filter(
    (item) => item.isActive && item.currentStock <= item.minStock,
  );
  const topSalesByProduct = Array.from(salesByProduct.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const topExpensesByCategory = Array.from(expensesByCategory.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  const salesByChannelCards = Array.from(salesByChannel.entries()).sort((left, right) => right[1] - left[1]);
  const batchPerformance = filteredBatches.slice(0, 6);

  return (
    <div className="page-grid">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Reportes</p>
            <h2 className="mt-2 text-3xl font-semibold">Analitica operativa</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Cruza ventas, gastos, lotes e inventario para leer el negocio por periodo.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold">
              Desde
              <input
                type="date"
                value={range.from}
                onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
                className="w-full rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 font-normal"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              Hasta
              <input
                type="date"
                value={range.to}
                onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
                className="w-full rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 font-normal"
              />
            </label>
          </div>
        </div>
      </Panel>

      {hasInvalidRange ? (
        <ActionNotice
          tone="warning"
          message={`El rango estaba invertido. Tomamos ${effectiveRange.from} como inicio y ${effectiveRange.to} como cierre para mantener el reporte consistente.`}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <p className="text-sm text-[var(--muted)]">Ventas</p>
          <p className="mt-2 text-3xl font-semibold">{formatCurrency(totalSales)}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-[var(--muted)]">Gastos</p>
          <p className="mt-2 text-3xl font-semibold text-[#934534]">{formatCurrency(totalExpenses)}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-[var(--muted)]">Margen</p>
          <p className="mt-2 text-3xl font-semibold">{formatCurrency(totalSales - totalExpenses)}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-[var(--muted)]">Lotes activos</p>
          <p className="mt-2 text-3xl font-semibold">{filteredBatches.filter((batch) => batch.status === "active").length}</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#15553e]" />
            <h3 className="text-2xl font-semibold">Ventas por producto</h3>
          </div>
          <div className="mt-5 space-y-4">
            {topSalesByProduct.length === 0 ? (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
                No hay ventas en el rango seleccionado.
              </div>
            ) : (
              topSalesByProduct.map(([name, amount]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#e8e3d7]">
                    <div
                      className="h-2 rounded-full bg-[#2f8d62]"
                      style={{ width: `${totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#934534]" />
            <h3 className="text-2xl font-semibold">Gastos por categoria</h3>
          </div>
          <div className="mt-5 space-y-4">
            {topExpensesByCategory.length === 0 ? (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
                No hay gastos en el rango seleccionado.
              </div>
            ) : (
              topExpensesByCategory.map(([name, amount]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#e8e3d7]">
                    <div
                      className="h-2 rounded-full bg-[#c45d49]"
                      style={{ width: `${totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-[#8c5b17]" />
            <h3 className="text-2xl font-semibold">Stock critico</h3>
          </div>
          <div className="mt-5 space-y-3">
            {criticalStock.length === 0 ? (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
                No hay productos ni insumos activos en stock critico.
              </div>
            ) : (
              criticalStock.map((item) => (
                <div key={item.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {item.currentStock} / minimo {item.minStock}
                      </p>
                    </div>
                    <CircleAlert className="h-5 w-5 text-[#d89b39]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-3">
            <Sprout className="h-5 w-5 text-[#15553e]" />
            <h3 className="text-2xl font-semibold">Rendimiento de lotes</h3>
          </div>
          <div className="mt-5 space-y-3">
            {batchPerformance.length === 0 ? (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
                No hay lotes dentro del rango seleccionado.
              </div>
            ) : (
              batchPerformance.map((batch) => {
              const ratio =
                batch.expectedQty && batch.expectedQty > 0 && batch.actualQty !== null
                  ? Math.round((batch.actualQty / batch.expectedQty) * 100)
                  : null;

              return (
                <div key={batch.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{batch.productName}</p>
                      <p className="text-sm text-[var(--muted)]">
                        Esperado {batch.expectedQty ?? "-"} / Real {batch.actualQty ?? "-"}
                      </p>
                    </div>
                    <p className="text-lg font-semibold">{ratio !== null ? `${ratio}%` : "-"}</p>
                  </div>
                </div>
              );
            })
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <h3 className="text-2xl font-semibold">Ventas por canal</h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {salesByChannelCards.length === 0 ? (
            <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)] md:col-span-2 xl:col-span-4">
              No hay ventas por canal para mostrar en este rango.
            </div>
          ) : (
            salesByChannelCards.map(([name, amount]) => (
              <div key={name} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                <p className="text-sm text-[var(--muted)]">{name}</p>
                <p className="mt-2 text-2xl font-semibold">{formatCurrency(amount)}</p>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
