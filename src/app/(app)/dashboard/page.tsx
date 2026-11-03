import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  DollarSign,
  Percent,
  ShoppingCart,
  Sprout,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { formatPercent } from "@/lib/finance";
import { formatQuantity } from "@/lib/pricing";
import { getDashboardData } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getPaymentTone(status: "pending" | "partial" | "paid") {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  return "neutral";
}

function getPaymentLabel(status: "pending" | "partial" | "paid") {
  if (status === "paid") return "Cobrada";
  if (status === "partial") return "Parcial";
  return "A cobrar";
}

const SECONDARY_ACTIONS = [
  { href: "/gastos?nuevo=gasto", label: "Gasto", icon: Wallet },
  { href: "/insumos?nuevo=compra", label: "Compra", icon: Archive },
  { href: "/produccion?nuevo=lote", label: "Lote", icon: Sprout },
] as const;

function ShareBars({ entries, empty }: { entries: { name: string; percentage: number }[]; empty: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  }

  return (
    <ul className="grid gap-3">
      {entries.map((entry) => (
        <li key={entry.name} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className="truncate">{entry.name}</span>
            <span className="font-semibold tabular-nums">{entry.percentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line)]">
            <div className="h-full rounded-full bg-[var(--foreground)]" style={{ width: `${Math.max(entry.percentage, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const alerts = [...data.lowStockProducts, ...data.lowStockSupplies];

  return (
    <div className="page-grid">
      {/* Lo primero que hace un empleado: cargar algo. */}
      <div className="grid gap-2 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <Link
          href="/ventas?nuevo=venta"
          className="flex min-h-16 items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[var(--amber)] px-4 text-[var(--foreground)] active:scale-[0.99]"
        >
          <span>
            <span className="block text-lg font-semibold">Nueva venta</span>
            <span className="block text-[13px] text-[#4a2c05]">Descuenta stock y registra el cobro</span>
          </span>
          <ShoppingCart className="h-7 w-7 shrink-0" />
        </Link>
        <div className="grid grid-cols-3 gap-2 md:contents">
          {SECONDARY_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] text-[15px] font-semibold active:bg-[var(--surface-2)]"
              >
                <Icon className="h-5 w-5 text-[var(--ink-2)]" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </div>

      {alerts.length > 0 ? (
        <Panel className="border-[var(--amber)] bg-[var(--amber-soft)]">
          <div className="flex items-center gap-2 text-[var(--amber-ink)]">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <h2 className="text-base font-semibold">
              {alerts.length === 1 ? "1 producto o insumo bajo el mínimo" : `${alerts.length} productos o insumos bajo el mínimo`}
            </h2>
          </div>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--surface)] px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{alert.label}</span>
                  <span className="block text-[13px] text-[var(--muted)]">
                    {alert.type === "product" ? "Producto" : "Insumo"} · mínimo {formatQuantity(alert.minStock)}
                  </span>
                </span>
                <span className="shrink-0 font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums text-[var(--amber-ink)]">
                  {formatQuantity(alert.currentStock)} {alert.unit}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Facturado"
          value={formatCurrency(data.monthlyBilled)}
          helper="Ventas del mes"
          icon={TrendingUp}
        />
        <MetricCard
          label="Cobrado"
          value={formatCurrency(data.monthlyCollected)}
          helper="De las ventas del mes, con cobros parciales"
          icon={DollarSign}
        />
        <MetricCard
          label="Por cobrar"
          value={formatCurrency(data.pendingReceivables)}
          helper="Saldo de todas las ventas"
          icon={Wallet}
          tone="warning"
        />
        <MetricCard
          label="Gastos"
          value={formatCurrency(data.monthlyExpenses)}
          helper="Gastos y compras de insumos del mes"
          icon={TrendingDown}
          tone="danger"
        />
        <MetricCard
          label="Resultado"
          value={formatCurrency(data.accrualProfit)}
          helper="Facturado menos gastos del mes"
          icon={TrendingUp}
          tone={data.accrualProfit >= 0 ? "accent" : "danger"}
        />
        {data.monthlyGrossMargin ? (
          <MetricCard
            label="Margen bruto"
            value={formatCurrency(data.monthlyGrossMargin.margin)}
            helper={data.monthlyGrossMargin.marginPercent === null ? "Todavía no hay ventas con costo este mes" : `${formatPercent(data.monthlyGrossMargin.marginPercent)} sobre ventas con costo${
              data.monthlyGrossMargin.missingCostLines > 0
                ? `; ${data.monthlyGrossMargin.missingCostLines} ${data.monthlyGrossMargin.missingCostLines === 1 ? "línea sin costo no cuenta" : "líneas sin costo no cuentan"}`
                : ""
            }`}
            icon={Percent}
            tone={data.monthlyGrossMargin.margin >= 0 ? "accent" : "danger"}
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Panel className="p-0 sm:p-0">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <h2 className="text-lg font-semibold">Últimas ventas</h2>
            <Link href="/ventas" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--ink-2)]">
              Ver todas
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {data.recentSales.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-[var(--muted)] sm:px-5">Todavía no hay ventas este mes.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {data.recentSales.map((sale) => (
                <li key={sale.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{sale.contactName ?? "Sin cliente"}</p>
                    <p className="truncate text-[13px] text-[var(--muted)]">
                      {formatDate(sale.saleDate)} · {sale.items.map((item) => `${item.productName} × ${formatQuantity(item.quantity)}`).join(", ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatCurrency(sale.totalAmount)}</p>
                    <Badge tone={getPaymentTone(sale.paymentStatus)} className="mt-1">
                      {getPaymentLabel(sale.paymentStatus)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Ventas por canal</h2>
            <ShareBars entries={data.channelShare} empty="Todavía no hay ventas del mes." />
          </Panel>
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Gastos por categoría</h2>
            <ShareBars entries={data.expenseShare} empty="Todavía no hay gastos del mes." />
          </Panel>
        </div>
      </div>
    </div>
  );
}
