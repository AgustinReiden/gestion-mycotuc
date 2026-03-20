"use client";

import { useDeferredValue, useState } from "react";
import { CircleDollarSign, Filter, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { PaymentStatusForm } from "@/components/forms/payment-status-form";
import { SaleOrderForm } from "@/components/forms/sale-order-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ContactRecord, LookupOption, ProductRecord, SaleOrderRecord } from "@/lib/domain";
import { formatCurrency, formatDate, sumBy } from "@/lib/utils";

type SalesShellProps = {
  sales: SaleOrderRecord[];
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
};

function getPaymentTone(status: SaleOrderRecord["paymentStatus"]) {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  return "neutral";
}

function getPaymentLabel(status: SaleOrderRecord["paymentStatus"]) {
  if (status === "paid") return "Pagado";
  if (status === "partial") return "Parcial";
  return "Pendiente";
}

function NewSaleModal({ contacts, products, channels }: { contacts: ContactRecord[]; products: ProductRecord[]; channels: LookupOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva venta
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva venta" description="Registra un pedido y descuenta stock automaticamente." size="xl">
        <SaleOrderForm contacts={contacts} products={products} channels={channels} onSuccess={() => { setOpen(false); router.refresh(); }} />
      </Modal>
    </>
  );
}

function PaymentModal({ sale, onClose }: { sale: SaleOrderRecord; onClose: () => void }) {
  const router = useRouter();

  return (
    <Modal open onClose={onClose} title="Actualizar estado de cobro" description="Ajusta el estado, metodo y fecha de cobro del pedido.">
      <PaymentStatusForm
        saleOrderId={sale.id}
        paymentStatus={sale.paymentStatus}
        paymentMethod={sale.paymentMethod}
        paidAt={sale.paidAt}
        onSuccess={() => { onClose(); router.refresh(); }}
      />
    </Modal>
  );
}

export function SalesShell({ sales, contacts, products, channels }: SalesShellProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SaleOrderRecord["paymentStatus"]>("all");
  const [selectedSale, setSelectedSale] = useState<SaleOrderRecord | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filteredSales = sales.filter((sale) => {
    const query = deferredSearch.toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      sale.contactName?.toLowerCase().includes(query) ||
      sale.channelName?.toLowerCase().includes(query) ||
      sale.items.some((item) => item.productName.toLowerCase().includes(query));
    const matchesStatus = statusFilter === "all" ? true : sale.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const paidCount = sales.filter((sale) => sale.paymentStatus === "paid").length;
  const pendingAmount = sumBy(
    sales.filter((sale) => sale.paymentStatus !== "paid"),
    (sale) => sale.totalAmount,
  );

  return (
    <div className="page-grid">
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Panel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Ventas</p>
              <h2 className="mt-2 text-3xl font-semibold">Pedidos y cobros</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Gestiona ventas multi-item, control de stock y seguimiento de cobro en un solo flujo.
              </p>
            </div>

            <NewSaleModal contacts={contacts} products={products} channels={channels} />
          </div>
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div>
            <p className="text-sm text-[var(--muted)]">Facturacion acumulada</p>
            <p className="mt-2 text-3xl font-semibold">{formatCurrency(sumBy(sales, (sale) => sale.totalAmount))}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div>
              <p className="text-sm text-[var(--muted)]">Pedidos cobrados</p>
              <p className="mt-2 text-2xl font-semibold">{paidCount}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Pendiente de cobro</p>
              <p className="mt-2 text-2xl font-semibold text-[#8c5b17]">{formatCurrency(pendingAmount)}</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cliente, canal o producto..."
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
              <Filter className="h-4 w-4 text-[var(--muted)]" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="bg-transparent text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendiente</option>
                <option value="partial">Parcial</option>
                <option value="paid">Pagado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[26px] border border-[var(--line)]">
          {filteredSales.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No hay ventas para este filtro"
                description="Prueba otro termino de busqueda o registra un nuevo pedido."
                icon={CircleDollarSign}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f4f1e8] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Cobro</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-[var(--line)] bg-white/80">
                      <td className="px-4 py-4">{formatDate(sale.saleDate)}</td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{sale.contactName ?? "Sin cliente"}</p>
                        <p className="text-xs text-[var(--muted)]">{sale.totalUnits} unidades</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {sale.items.slice(0, 2).map((item) => (
                            <p key={item.id} className="text-sm">
                              {item.productName} x {item.quantity}
                            </p>
                          ))}
                          {sale.items.length > 2 ? (
                            <p className="text-xs text-[var(--muted)]">+{sale.items.length - 2} items mas</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone="accent">{sale.channelName ?? "Sin canal"}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={getPaymentTone(sale.paymentStatus)}>{getPaymentLabel(sale.paymentStatus)}</Badge>
                      </td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(sale.totalAmount)}</td>
                      <td className="px-4 py-4 text-right">
                        <Button type="button" variant="ghost" onClick={() => setSelectedSale(sale)}>
                          Editar cobro
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {selectedSale ? <PaymentModal sale={selectedSale} onClose={() => setSelectedSale(null)} /> : null}
    </div>
  );
}
