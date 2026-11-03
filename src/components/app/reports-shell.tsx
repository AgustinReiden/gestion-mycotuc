"use client";

import { useState } from "react";
import { BarChart3, CircleAlert, Package, Sprout } from "lucide-react";
import { ActionNotice } from "@/components/forms/action-notice";
import { Panel } from "@/components/ui/panel";
import type {
  AppRole,
  ExpenseRecord,
  ProductRecord,
  ProductionBatchRecord,
  SaleOrderRecord,
  SupplyRecord,
} from "@/lib/domain";
import {
  formatPercent,
  getMarginByProduct,
  summarizeMargin,
  summarizeReceivables,
} from "@/lib/finance";
import { formatQuantity } from "@/lib/pricing";
import { formatCurrency, sumBy, todayISO } from "@/lib/utils";

type ReportsShellProps = {
  sales: SaleOrderRecord[];
  expenses: ExpenseRecord[];
  products: ProductRecord[];
  supplies: SupplyRecord[];
  batches: ProductionBatchRecord[];
  role: AppRole;
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

export function ReportsShell({
  sales,
  expenses,
  products,
  supplies,
  batches,
  role,
}: ReportsShellProps) {
  const isAdmin = role === "admin";
  const [range, setRange] = useState<RangeFilter>({
    from: todayISO(new Date(new Date().setDate(new Date().getDate() - 30))),
    to: todayISO(),
  });
  const hasInvalidRange = range.from > range.to;
  const effectiveRange = normalizeRange(range);

  const filteredSales = sales.filter(
    (sale) => !sale.isVoided && inRange(sale.saleDate, effectiveRange),
  );
  const filteredExpenses = expenses.filter(
    (expense) => !expense.isVoided && inRange(expense.expenseDate, effectiveRange),
  );
  const filteredBatches = batches.filter(
    (batch) => !batch.isVoided && inRange(batch.startedAt, effectiveRange),
  );

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
    expensesByCategory.set(expense.categoryName ?? "Sin categoría", (expensesByCategory.get(expense.categoryName ?? "Sin categoría") ?? 0) + expense.amount);
  });

  // Cobrado usa lo efectivamente cobrado (incluye parciales); el saldo es total menos cobrado.
  const {
    billed: totalSales,
    collected: totalCollected,
    pending: pendingReceivables,
  } = summarizeReceivables(filteredSales);
  const totalExpenses = sumBy(filteredExpenses, (expense) => expense.amount);
  const marginByProduct = isAdmin ? getMarginByProduct(filteredSales) : [];
  const totalMargin = isAdmin
    ? summarizeMargin(filteredSales.flatMap((sale) => sale.items))
    : null;

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
      <div className="grid grid-cols-2 gap-3 md:max-w-xl">
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink-2)]">
          Desde
          <input
            type="date"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base font-normal text-[var(--foreground)] focus:border-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink-2)]">
          Hasta
          <input
            type="date"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base font-normal text-[var(--foreground)] focus:border-[var(--foreground)]"
          />
        </label>
      </div>

      {hasInvalidRange ? (
        <ActionNotice
          tone="warning"
          message={`El rango estaba invertido. Tomamos ${effectiveRange.from} como inicio y ${effectiveRange.to} como cierre para mantener el reporte consistente.`}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Panel className="p-3.5 sm:p-4">
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Facturado</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">{formatCurrency(totalSales)}</p>
        </Panel>
        <Panel className="p-3.5 sm:p-4">
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Cobrado</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-[var(--moss)]">
            {formatCurrency(totalCollected)}
          </p>
        </Panel>
        <Panel className="p-3.5 sm:p-4">
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Gastos</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">{formatCurrency(totalExpenses)}</p>
        </Panel>
        <Panel className="p-3.5 sm:p-4">
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Margen devengado</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">{formatCurrency(totalSales - totalExpenses)}</p>
        </Panel>
        <Panel className="p-3.5 sm:p-4">
          <p className="text-[13px] font-medium text-[var(--ink-2)]">Pendiente de cobro</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-[var(--amber-ink)]">
            {formatCurrency(pendingReceivables)}
          </p>
        </Panel>
        {totalMargin ? (
          <Panel className="col-span-2 p-3.5 sm:p-4 xl:col-span-1">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Margen bruto (ventas - costo)</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-[var(--moss)]">
              {formatCurrency(totalMargin.margin)}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {formatPercent(totalMargin.marginPercent)} sobre ventas con costo registrado
            </p>
          </Panel>
        ) : null}
      </div>

      {isAdmin ? (
        <Panel>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[var(--moss)]" />
            <h3 className="text-xl font-semibold">Margen por producto</h3>
          </div>
          {totalMargin && totalMargin.missingCostLines > 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {totalMargin.missingCostLines} línea(s) de venta sin costo registrado no entran al margen.
            </p>
          ) : null}
          {marginByProduct.length === 0 ? (
            <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
              No hay ventas en el rango seleccionado.
            </div>
          ) : (
            <>
            <ul className="mt-4 grid gap-2 md:hidden">
              {marginByProduct.map((row) => (
                <li key={row.productName} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold">{row.productName}</p>
                    <p className="shrink-0 font-semibold text-[var(--moss)]">{formatPercent(row.marginPercent)}</p>
                  </div>
                  <p className="mt-1 text-[var(--muted)]">
                    {formatQuantity(row.quantity)} un. · Ventas {formatCurrency(row.revenue)} · Costo {formatCurrency(row.cost)}
                  </p>
                  <p className="mt-1 font-semibold">Margen {formatCurrency(row.margin)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--line)] md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium">Unidades</th>
                    <th className="px-4 py-3 font-medium">Ventas</th>
                    <th className="px-4 py-3 font-medium">Costo</th>
                    <th className="px-4 py-3 font-medium">Margen</th>
                    <th className="px-4 py-3 font-medium">Margen %</th>
                  </tr>
                </thead>
                <tbody>
                  {marginByProduct.map((row) => (
                    <tr key={row.productName} className="border-t border-[var(--line)] bg-[var(--surface)]">
                      <td className="px-4 py-3 font-semibold">{row.productName}</td>
                      <td className="px-4 py-3">{formatQuantity(row.quantity)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.revenue)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.cost)}</td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(row.margin)}</td>
                      <td className="px-4 py-3">{formatPercent(row.marginPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[var(--moss)]" />
            <h3 className="text-xl font-semibold">Ventas por producto</h3>
          </div>
          <div className="mt-4 space-y-4">
            {topSalesByProduct.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
                No hay ventas en el rango seleccionado.
              </div>
            ) : (
              topSalesByProduct.map(([name, amount]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
                    <div
                      className="h-2 rounded-full bg-[var(--moss)]"
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
            <BarChart3 className="h-5 w-5 text-[var(--danger)]" />
            <h3 className="text-xl font-semibold">Gastos por categoría</h3>
          </div>
          <div className="mt-4 space-y-4">
            {topExpensesByCategory.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
                No hay gastos en el rango seleccionado.
              </div>
            ) : (
              topExpensesByCategory.map(([name, amount]) => (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
                    <div
                      className="h-2 rounded-full bg-[var(--amber)]"
                      style={{ width: `${totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-[var(--amber-ink)]" />
            <h3 className="text-xl font-semibold">Stock crítico</h3>
          </div>
          <div className="mt-4 space-y-2">
            {criticalStock.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
                No hay productos ni insumos activos en stock crítico.
              </div>
            ) : (
              criticalStock.map((item) => (
                <div key={item.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {item.currentStock} / mínimo {item.minStock}
                      </p>
                    </div>
                    <CircleAlert className="h-5 w-5 text-[var(--amber-ink)]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-3">
            <Sprout className="h-5 w-5 text-[var(--moss)]" />
            <h3 className="text-xl font-semibold">Rendimiento de lotes</h3>
          </div>
          <div className="mt-4 space-y-2">
            {batchPerformance.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)]">
                No hay lotes dentro del rango seleccionado.
              </div>
            ) : (
              batchPerformance.map((batch) => {
              const ratio =
                batch.expectedQty && batch.expectedQty > 0 && batch.actualQty !== null
                  ? Math.round((batch.actualQty / batch.expectedQty) * 100)
                  : null;

              return (
                <div key={batch.id} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
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
        <h3 className="text-xl font-semibold">Ventas por canal</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {salesByChannelCards.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm text-[var(--muted)] col-span-2 xl:col-span-4">
              No hay ventas por canal para mostrar en este rango.
            </div>
          ) : (
            salesByChannelCards.map(([name, amount]) => (
              <div key={name} className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                <p className="text-sm text-[var(--muted)]">{name}</p>
                <p className="mt-1 font-[family-name:var(--font-heading)] text-xl font-semibold tabular-nums">{formatCurrency(amount)}</p>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
