import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { LazyDonutChart } from "@/components/app/charts/lazy-donut-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { getDashboardData } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const alerts = [...data.lowStockProducts, ...data.lowStockSupplies];

  return (
    <div className="page-grid">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Ventas del mes"
          value={formatCurrency(data.monthlySales)}
          helper="Facturacion registrada en el periodo actual."
          icon={TrendingUp}
        />
        <MetricCard
          label="Gastos del mes"
          value={formatCurrency(data.monthlyExpenses)}
          helper="Incluye compras de insumos y gastos manuales."
          icon={TrendingDown}
          tone="danger"
        />
        <MetricCard
          label="Ganancia neta"
          value={formatCurrency(data.netProfit)}
          helper="Diferencia entre ventas y gastos."
          icon={DollarSign}
          tone={data.netProfit >= 0 ? "accent" : "danger"}
        />
        <MetricCard
          label="Unidades vendidas"
          value={String(data.soldUnits)}
          helper="Suma de cantidades vendidas este mes."
          icon={Package}
          tone="info"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.9fr_1.1fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Actividad</p>
              <h2 className="mt-2 text-3xl font-semibold">Ultimas ventas</h2>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/ventas">Ver todas</Link>
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {data.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-col gap-3 rounded-[24px] border border-[var(--line)] bg-white/80 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dce8db] text-[#15553e]">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{sale.contactName ?? "Sin cliente"}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {sale.items.map((item) => `${item.productName} x${item.quantity}`).join(" / ")}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">
                      {formatDate(sale.saleDate)}
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-lg font-semibold">{formatCurrency(sale.totalAmount)}</p>
                  <Badge
                    tone={
                      sale.paymentStatus === "paid"
                        ? "success"
                        : sale.paymentStatus === "partial"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {sale.channelName ?? "Sin canal"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel>
            <h3 className="text-2xl font-semibold">Acciones rapidas</h3>
            <div className="mt-4 grid gap-3">
              <Button asChild>
                <Link href="/ventas">Registrar venta</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/gastos">Cargar gasto</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/produccion">Abrir lote</Link>
              </Button>
            </div>
          </Panel>

          <Panel>
            <h3 className="text-2xl font-semibold">Ventas por canal</h3>
            <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <LazyDonutChart
                data={data.channelShare}
                colors={["#3b5f42", "#a54b3d", "#b77f28", "#798075"]}
              />
              <div className="space-y-3">
                {data.channelShare.map((entry, i) => {
                  const colors = [
                    "bg-[#3b5f42]",
                    "bg-[#a54b3d]",
                    "bg-[#b77f28]",
                    "bg-[#798075]",
                  ];
                  return (
                    <div key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${colors[i % colors.length]}`} />
                        <span>{entry.name}</span>
                      </div>
                      <span className="font-semibold">{entry.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7e7c6] text-[#8c5b17]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Alertas de stock bajo</h3>
              <p className="text-sm text-[var(--muted)]">
                Productos e insumos por debajo del minimo operativo.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {alerts.length === 0 ? (
              <div className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--muted)]">
                No hay alertas activas de stock.
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="rounded-[24px] border border-[var(--line)] bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{alert.label}</p>
                      <p className="text-sm text-[var(--muted)]">
                        Stock actual: {alert.currentStock} {alert.unit}
                      </p>
                    </div>
                    <Badge tone={alert.type === "product" ? "danger" : "warning"}>
                      Min {alert.minStock}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dce7ef] text-[#235b72]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold">Gastos por categoria</h3>
              <p className="text-sm text-[var(--muted)]">
                Distribucion mensual para lectura rapida.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <LazyDonutChart
              data={data.expenseShare}
              colors={["#a54b3d", "#b77f28", "#3b5f42", "#798075"]}
            />
            <div className="space-y-3">
              {data.expenseShare.map((entry, i) => {
                const colors = [
                  "bg-[#a54b3d]",
                  "bg-[#b77f28]",
                  "bg-[#3b5f42]",
                  "bg-[#798075]",
                ];
                return (
                  <div key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${colors[i % colors.length]}`} />
                      <span>{entry.name}</span>
                    </div>
                    <span className="font-semibold">{entry.percentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
