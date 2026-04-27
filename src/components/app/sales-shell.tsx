"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { CircleDollarSign, Filter, Plus, RotateCcw, Search } from "lucide-react";
import { reverseSaleOrderAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { PaymentStatusForm } from "@/components/forms/payment-status-form";
import { SaleOrderForm } from "@/components/forms/sale-order-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type {
  ContactRecord,
  LookupOption,
  ProductRecord,
  SaleOrderRecord,
} from "@/lib/domain";
import { formatCurrency, formatDate, sumBy } from "@/lib/utils";

type SalesShellProps = {
  sales: SaleOrderRecord[];
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
};

type CreateSaleOrderResult = {
  sale: SaleOrderRecord;
  contact: ContactRecord;
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

function sortSales(list: SaleOrderRecord[]) {
  return [...list].sort((left, right) => {
    const saleDateComparison = right.saleDate.localeCompare(left.saleDate);

    if (saleDateComparison !== 0) {
      return saleDateComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function upsertSale(list: SaleOrderRecord[], sale: SaleOrderRecord) {
  return sortSales([sale, ...list.filter((entry) => entry.id !== sale.id)]);
}

function upsertContact(list: ContactRecord[], contact: ContactRecord) {
  return [...list.filter((entry) => entry.id !== contact.id), contact].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
  );
}

function NewSaleModal({
  contacts,
  products,
  channels,
  onSaleCreated,
}: {
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  onSaleCreated: (result: CreateSaleOrderResult) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nueva venta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva venta"
        description="Registra un pedido y descuenta stock automaticamente."
        size="xl"
      >
        <SaleOrderForm
          contacts={contacts}
          products={products}
          channels={channels}
          onSuccess={(result) => {
            setOpen(false);
            onSaleCreated(result);
          }}
        />
      </Modal>
    </>
  );
}

function PaymentModal({
  sale,
  onClose,
  onSaleUpdated,
}: {
  sale: SaleOrderRecord;
  onClose: () => void;
  onSaleUpdated: (sale: SaleOrderRecord) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Actualizar estado de cobro"
      description="Ajusta el estado, metodo y fecha de cobro del pedido."
    >
      <PaymentStatusForm
        saleOrderId={sale.id}
        paymentStatus={sale.paymentStatus}
        paymentMethod={sale.paymentMethod}
        paidAt={sale.paidAt}
        onSuccess={(updatedSale) => {
          onSaleUpdated(updatedSale);
          onClose();
        }}
      />
    </Modal>
  );
}

function ReverseSaleModal({
  sale,
  onClose,
  onSaleReversed,
}: {
  sale: SaleOrderRecord;
  onClose: () => void;
  onSaleReversed: (sale: SaleOrderRecord) => void;
}) {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open
      onClose={onClose}
      title="Anular venta"
      description="Genera movimientos de reversa y conserva la venta como registro historico."
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[#f7f5ef] px-4 py-3 text-sm text-[var(--muted)]">
          Se reintegrara stock por {sale.contactName ?? "cliente sin nombre"} y la venta dejara de
          contar en dashboard y reportes.
        </div>
        <label className="space-y-2 text-sm font-semibold">
          Motivo
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-3 text-sm font-normal"
            rows={4}
            placeholder="Error de carga, devolucion o cancelacion."
          />
        </label>
        {feedback ? <ActionNotice tone="error" message={feedback} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            busy={pending}
            onClick={() => {
              setFeedback(null);
              startTransition(async () => {
                const result = await reverseSaleOrderAction({ id: sale.id, reason });
                if (result.success && result.data) {
                  onSaleReversed(result.data.sale);
                  onClose();
                  return;
                }

                setFeedback(result.error ?? result.message);
              });
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Anular venta
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SalesShell({ sales, contacts, products, channels }: SalesShellProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SaleOrderRecord["paymentStatus"]>("all");
  const [saleRecords, setSaleRecords] = useState(() => sortSales(sales));
  const [contactRecords, setContactRecords] = useState(contacts);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [reverseSaleId, setReverseSaleId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;
  const hasStatusFilter = statusFilter !== "all";
  const selectedSale = selectedSaleId
    ? saleRecords.find((sale) => sale.id === selectedSaleId) ?? null
    : null;
  const reverseSale = reverseSaleId
    ? saleRecords.find((sale) => sale.id === reverseSaleId) ?? null
    : null;

  useEffect(() => {
    setSaleRecords(sortSales(sales));
  }, [sales]);

  useEffect(() => {
    setContactRecords(contacts);
  }, [contacts]);

  const filteredSales = saleRecords.filter((sale) => {
    const query = deferredSearch.toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      sale.contactName?.toLowerCase().includes(query) ||
      sale.channelName?.toLowerCase().includes(query) ||
      sale.items.some((item) => item.productName.toLowerCase().includes(query));
    const matchesStatus = statusFilter === "all" ? true : sale.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeSales = saleRecords.filter((sale) => !sale.isVoided);
  const paidCount = activeSales.filter((sale) => sale.paymentStatus === "paid").length;
  const pendingAmount = sumBy(
    activeSales.filter((sale) => sale.paymentStatus !== "paid"),
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

            <NewSaleModal
              contacts={contactRecords}
              products={products}
              channels={channels}
              onSaleCreated={(result) => {
                setSaleRecords((current) => upsertSale(current, result.sale));
                setContactRecords((current) => upsertContact(current, result.contact));
              }}
            />
          </div>
        </Panel>

        <Panel className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div>
            <p className="text-sm text-[var(--muted)]">Facturacion acumulada</p>
            <p className="mt-2 text-3xl font-semibold">
              {formatCurrency(sumBy(activeSales, (sale) => sale.totalAmount))}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div>
              <p className="text-sm text-[var(--muted)]">Pedidos cobrados</p>
              <p className="mt-2 text-2xl font-semibold">{paidCount}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Pendiente de cobro</p>
              <p className="mt-2 text-2xl font-semibold text-[#8c5b17]">
                {formatCurrency(pendingAmount)}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cliente, canal o producto..."
                aria-label="Buscar ventas"
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <div className="flex w-full items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:w-auto">
              <Filter className="h-4 w-4 text-[var(--muted)]" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                aria-label="Filtrar ventas por estado de cobro"
                className="min-w-0 flex-1 bg-transparent text-sm sm:min-w-[190px]"
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
                title={
                  hasSearchQuery || hasStatusFilter
                    ? "No encontramos ventas"
                    : "Todavia no hay ventas"
                }
                description={
                  hasSearchQuery || hasStatusFilter
                    ? "Prueba otro termino de busqueda, cambia el filtro o registra un nuevo pedido."
                    : "Registra tu primera venta para empezar a seguir pedidos y cobros."
                }
                icon={CircleDollarSign}
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--line)] md:hidden">
                {filteredSales.map((sale) => (
                  <article key={sale.id} className="space-y-4 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">
                          {formatDate(sale.saleDate)}
                        </p>
                        <h3 className="mt-2 font-semibold">{sale.contactName ?? "Sin cliente"}</h3>
                        <p className="text-sm text-[var(--muted)]">{sale.totalUnits} unidades</p>
                      </div>
                      <p className="text-lg font-semibold">{formatCurrency(sale.totalAmount)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge tone="accent">{sale.channelName ?? "Sin canal"}</Badge>
                      <Badge tone={getPaymentTone(sale.paymentStatus)}>
                        {getPaymentLabel(sale.paymentStatus)}
                      </Badge>
                      {sale.isVoided ? <Badge tone="danger">Anulada</Badge> : null}
                    </div>

                    <div className="space-y-2 rounded-[22px] border border-[var(--line)] bg-[#f8f6ef] p-4 text-sm">
                      {sale.items.slice(0, 3).map((item) => (
                        <p key={item.id}>
                          {item.productName} x {item.quantity}
                        </p>
                      ))}
                      {sale.items.length > 3 ? (
                        <p className="text-xs text-[var(--muted)]">
                          +{sale.items.length - 3} items mas
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full justify-center"
                        disabled={sale.isVoided}
                        onClick={() => setSelectedSaleId(sale.id)}
                      >
                        Editar cobro
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full justify-center"
                        disabled={sale.isVoided}
                        onClick={() => setReverseSaleId(sale.id)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Anular
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
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
                              <p className="text-xs text-[var(--muted)]">
                                +{sale.items.length - 2} items mas
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone="accent">{sale.channelName ?? "Sin canal"}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge tone={getPaymentTone(sale.paymentStatus)}>
                            {getPaymentLabel(sale.paymentStatus)}
                          </Badge>
                          {sale.isVoided ? <Badge tone="danger">Anulada</Badge> : null}
                        </td>
                        <td className="px-4 py-4 font-semibold">{formatCurrency(sale.totalAmount)}</td>
                        <td className="px-4 py-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={sale.isVoided}
                            onClick={() => setSelectedSaleId(sale.id)}
                          >
                            Editar cobro
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={sale.isVoided}
                            onClick={() => setReverseSaleId(sale.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Anular
                          </Button>
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

      {selectedSale ? (
        <PaymentModal
          sale={selectedSale}
          onClose={() => setSelectedSaleId(null)}
          onSaleUpdated={(updatedSale) => {
            setSaleRecords((current) => upsertSale(current, updatedSale));
          }}
        />
      ) : null}
      {reverseSale ? (
        <ReverseSaleModal
          sale={reverseSale}
          onClose={() => setReverseSaleId(null)}
          onSaleReversed={(updatedSale) => {
            setSaleRecords((current) => upsertSale(current, updatedSale));
          }}
        />
      ) : null}
    </div>
  );
}
