"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { ChevronRight, CircleDollarSign, Plus, RotateCcw, Search } from "lucide-react";
import { reverseSaleOrderAction } from "@/actions/sales";
import { ActionNotice } from "@/components/forms/action-notice";
import { PaymentStatusForm } from "@/components/forms/payment-status-form";
import { SaleOrderForm } from "@/components/forms/sale-order-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import type {
  AppRole,
  BundleRecord,
  ContactRecord,
  LookupOption,
  PriceTierRecord,
  ProductRecord,
  SaleOrderItemRecord,
  SaleOrderRecord,
} from "@/lib/domain";
import {
  formatPercent,
  getLineCost,
  getMarginPercent,
  getSaleBalance,
  summarizeMargin,
} from "@/lib/finance";
import { formatQuantity, roundMoney } from "@/lib/pricing";
import { cn, formatCurrency, formatDate, sumBy } from "@/lib/utils";

type SalesShellProps = {
  sales: SaleOrderRecord[];
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  priceTiers: PriceTierRecord[];
  bundles: BundleRecord[];
  role: AppRole;
};

type SaleLineGroup = {
  key: string;
  label: string;
  isBundle: boolean;
  quantity: number;
  unitPrice: number;
  listPrice: number | null;
  lineTotal: number;
  /** Costo de la linea (o suma de componentes del combo); null si falta algun costo. */
  cost: number | null;
  components: SaleOrderItemRecord[];
};

function addCost(current: number | null, next: number | null) {
  return current === null || next === null ? null : roundMoney(current + next);
}

/** Agrupa las lineas de un combo (mismo bundle_id) bajo el nombre del combo. */
function groupSaleItems(items: SaleOrderItemRecord[]): SaleLineGroup[] {
  const groups: SaleLineGroup[] = [];
  const bundleGroups = new Map<string, SaleLineGroup>();

  items.forEach((item) => {
    if (!item.bundleId) {
      groups.push({
        key: item.id,
        label: item.productName,
        isBundle: false,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        listPrice: item.listPrice,
        lineTotal: item.lineTotal,
        cost: getLineCost(item.quantity, item.unitCost),
        components: [],
      });
      return;
    }

    const existing = bundleGroups.get(item.bundleId);

    if (existing) {
      existing.lineTotal += item.lineTotal;
      existing.cost = addCost(existing.cost, getLineCost(item.quantity, item.unitCost));
      existing.components.push(item);
      return;
    }

    const group: SaleLineGroup = {
      key: `bundle-${item.bundleId}`,
      label: item.bundleName ?? "Combo",
      isBundle: true,
      quantity: 0,
      unitPrice: 0,
      listPrice: null,
      lineTotal: item.lineTotal,
      cost: getLineCost(item.quantity, item.unitCost),
      components: [item],
    };

    bundleGroups.set(item.bundleId, group);
    groups.push(group);
  });

  return groups;
}

function describeGroup(group: SaleLineGroup) {
  if (!group.isBundle) {
    return `${group.label} x ${formatQuantity(group.quantity)}`;
  }

  return `Combo ${group.label} (${group.components
    .map((component) => `${component.productName} x ${formatQuantity(component.quantity)}`)
    .join(", ")})`;
}

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
  if (status === "paid") return "Cobrada";
  if (status === "partial") return "Parcial";
  return "A cobrar";
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

/** Las acciones no devuelven costos: se conservan los que ya llegaron del servidor. */
function upsertSale(list: SaleOrderRecord[], sale: SaleOrderRecord) {
  const previous = list.find((entry) => entry.id === sale.id);
  const merged = previous
    ? {
        ...sale,
        items: sale.items.map((item) => ({
          ...item,
          unitCost:
            item.unitCost ?? previous.items.find((entry) => entry.id === item.id)?.unitCost ?? null,
        })),
      }
    : sale;

  return sortSales([merged, ...list.filter((entry) => entry.id !== sale.id)]);
}

function PaymentSummary({ sale }: { sale: SaleOrderRecord }) {
  if (sale.paymentStatus === "paid" || sale.isVoided) {
    return null;
  }

  return (
    <p className="mt-1 text-xs text-[var(--muted)]">
      Cobrado {formatCurrency(sale.amountPaid)} / Saldo{" "}
      {formatCurrency(getSaleBalance(sale.totalAmount, sale.amountPaid))}
    </p>
  );
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
  priceTiers,
  bundles,
  role,
  onSaleCreated,
}: {
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  priceTiers: PriceTierRecord[];
  bundles: BundleRecord[];
  role: AppRole;
  onSaleCreated: (result: CreateSaleOrderResult) => void;
}) {
  const [open, setOpen] = useQuickCreate("venta");

  return (
    <>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
        Nueva venta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva venta"
        description="Descuenta el stock al guardar."
        size="xl"
      >
        <SaleOrderForm
          contacts={contacts}
          products={products}
          channels={channels}
          priceTiers={priceTiers}
          bundles={bundles}
          role={role}
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
  role,
  onClose,
  onSaleUpdated,
}: {
  sale: SaleOrderRecord;
  role: AppRole;
  onClose: () => void;
  onSaleUpdated: (sale: SaleOrderRecord) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Actualizar estado de cobro"
      description="Registrá un cobro parcial, saldá la venta o corregí método y fecha."
    >
      <PaymentStatusForm
        saleOrderId={sale.id}
        paymentStatus={sale.paymentStatus}
        paymentMethod={sale.paymentMethod}
        paidAt={sale.paidAt}
        totalAmount={sale.totalAmount}
        amountPaid={sale.amountPaid}
        role={role}
        onSuccess={(updatedSale) => {
          onSaleUpdated(updatedSale);
          onClose();
        }}
      />
    </Modal>
  );
}

function SaleDetailModal({
  sale,
  isAdmin,
  onClose,
  onEditPayment,
  onReverse,
}: {
  sale: SaleOrderRecord;
  isAdmin: boolean;
  onClose: () => void;
  onEditPayment: () => void;
  onReverse: () => void;
}) {
  const groups = groupSaleItems(sale.items);
  const margin = isAdmin ? summarizeMargin(sale.items) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalle de la venta"
      description={`${sale.contactName ?? "Sin cliente"} · ${formatDate(sale.saleDate)}`}
    >
      <div className="space-y-3">
        {sale.isVoided ? <ActionNotice tone="warning" message="Venta anulada: no cuenta en el tablero ni en los reportes." /> : null}
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-[14px] border border-[var(--line)] p-3.5 text-[15px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {group.isBundle ? `Combo ${group.label}` : group.label}
                </p>
                {!group.isBundle ? (
                  <p className="text-xs text-[var(--muted)]">
                    {formatQuantity(group.quantity)} x {formatCurrency(group.unitPrice)}
                    {group.listPrice !== null && group.listPrice !== group.unitPrice
                      ? ` (lista ${formatCurrency(group.listPrice)})`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {group.isBundle ? <Badge tone="accent">Combo</Badge> : null}
                {!group.isBundle && group.listPrice !== null && group.listPrice !== group.unitPrice ? (
                  <Badge tone="warning">Precio manual</Badge>
                ) : null}
                <p className="font-semibold">{formatCurrency(group.lineTotal)}</p>
              </div>
            </div>
            {isAdmin ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {group.cost === null
                  ? "Sin costo registrado"
                  : `Costo ${formatCurrency(group.cost)} / Margen ${formatCurrency(
                      group.lineTotal - group.cost,
                    )} (${formatPercent(getMarginPercent(group.lineTotal, group.cost))})`}
              </p>
            ) : null}
            {group.isBundle ? (
              <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                {group.components.map((component) => (
                  <li key={component.id}>
                    {component.productName} x {formatQuantity(component.quantity)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        <div className="flex items-center justify-between rounded-[14px] bg-[var(--surface-2)] px-3.5 py-3">
          <p className="text-[15px] font-semibold">Total</p>
          <p className="font-[family-name:var(--font-heading)] text-xl font-semibold tabular-nums">{formatCurrency(sale.totalAmount)}</p>
        </div>
        {margin ? (
          <div className="grid grid-cols-3 gap-3 rounded-[14px] border border-[var(--line)] px-3.5 py-3 text-[15px]">
            <div>
              <p className="text-[13px] font-medium text-[var(--muted)]">Costo</p>
              <p className="mt-1 font-semibold">{formatCurrency(margin.cost)}</p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-[var(--muted)]">Margen</p>
              <p className="mt-1 font-semibold text-[var(--moss)]">{formatCurrency(margin.margin)}</p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-[var(--muted)]">Margen %</p>
              <p className="mt-1 font-semibold">{formatPercent(margin.marginPercent)}</p>
            </div>
            {margin.missingCostLines > 0 ? (
              <p className="text-xs text-[var(--muted)] sm:col-span-3">
                {margin.missingCostLines} línea(s) sin costo registrado no entran al margen.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-[var(--line)] px-3.5 py-3 text-[15px]">
          <div>
            <p className="text-[13px] font-medium text-[var(--muted)]">Cobrado</p>
            <p className="mt-1 font-semibold text-[var(--moss)]">{formatCurrency(sale.amountPaid)}</p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-[var(--muted)]">Saldo pendiente</p>
            <p className="mt-1 font-semibold text-[var(--amber-ink)]">
              {formatCurrency(getSaleBalance(sale.totalAmount, sale.amountPaid))}
            </p>
          </div>
        </div>
        <div className="rounded-[14px] border border-[var(--line)] p-3.5 text-[15px]">
          <p className="font-semibold">Historial de cobros</p>
          {sale.payments.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">Todavía no hay cobros.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {sale.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3">
                  <span className="text-[var(--muted)]">
                    {formatDate(payment.paidAt)} - {payment.paymentMethod ?? "Sin método"}
                  </span>
                  <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!sale.isVoided ? (
          <div className="sheet-actions flex flex-wrap items-center justify-between gap-2">
            {isAdmin ? (
              <Button type="button" variant="ghost" className="text-[var(--danger)]" onClick={onReverse}>
                <RotateCcw className="h-4 w-4" />
                Anular venta
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" variant={sale.paymentStatus === "paid" ? "secondary" : "primary"} onClick={onEditPayment}>
              {sale.paymentStatus === "paid" ? "Editar cobro" : "Registrar cobro"}
            </Button>
          </div>
        ) : null}
      </div>
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
      description="Genera movimientos de reversa y conserva la venta como registro histórico."
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-3 text-[15px] text-[var(--ink-2)]">
          Vuelve el stock de la venta a {sale.contactName ?? "cliente sin nombre"} y deja de contar en el tablero y
          los reportes.
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink-2)]">
          Motivo
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-base font-normal focus:border-[var(--foreground)]"
            rows={4}
            placeholder="Error de carga, devolución o cancelación"
          />
        </label>
        {feedback ? <ActionNotice tone="error" message={feedback} /> : null}
        <div className="sheet-actions flex justify-end gap-2">
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

export function SalesShell({
  sales,
  contacts,
  products,
  channels,
  priceTiers,
  bundles,
  role,
}: SalesShellProps) {
  const isAdmin = role === "admin";
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
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
  const detailSale = detailSaleId
    ? saleRecords.find((sale) => sale.id === detailSaleId) ?? null
    : null;

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedSales, setSyncedSales] = useState(sales);
  if (syncedSales !== sales) {
    setSyncedSales(sales);
    setSaleRecords(sortSales(sales));
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedContacts, setSyncedContacts] = useState(contacts);
  if (syncedContacts !== contacts) {
    setSyncedContacts(contacts);
    setContactRecords(contacts);
  }

  const filteredSales = saleRecords.filter((sale) => {
    const query = deferredSearch.toLowerCase();
    const matchesSearch =
      query.length === 0 ||
      sale.contactName?.toLowerCase().includes(query) ||
      sale.channelName?.toLowerCase().includes(query) ||
      sale.items.some(
        (item) =>
          item.productName.toLowerCase().includes(query) ||
          Boolean(item.bundleName?.toLowerCase().includes(query)),
      );
    const matchesStatus = statusFilter === "all" ? true : sale.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeSales = saleRecords.filter((sale) => !sale.isVoided);
  const paidCount = activeSales.filter((sale) => sale.paymentStatus === "paid").length;
  const pendingAmount = sumBy(activeSales, (sale) =>
    getSaleBalance(sale.totalAmount, sale.amountPaid),
  );

  const statusFilters: { value: typeof statusFilter; label: string }[] = [
    { value: "all", label: "Todas" },
    { value: "pending", label: "A cobrar" },
    { value: "partial", label: "Parciales" },
    { value: "paid", label: "Cobradas" },
  ];

  return (
    <div className="page-grid">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid grid-cols-2 gap-3 md:max-w-xl">
          <Panel className="p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Por cobrar</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-[var(--amber-ink)]">
              {formatCurrency(pendingAmount)}
            </p>
          </Panel>
          <Panel className="p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Facturado</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">
              {formatCurrency(sumBy(activeSales, (sale) => sale.totalAmount))}
            </p>
            <p className="text-[13px] text-[var(--muted)]">{paidCount} {paidCount === 1 ? "cobrada" : "cobradas"}</p>
          </Panel>
        </div>
        <NewSaleModal
          contacts={contactRecords}
          products={products}
          channels={channels}
          priceTiers={priceTiers}
          bundles={bundles}
          role={role}
          onSaleCreated={(result) => {
            setSaleRecords((current) => upsertSale(current, result.sale));
            setContactRecords((current) => upsertContact(current, result.contact));
          }}
        />
      </div>

      <div className="grid gap-2">
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente, canal o producto"
            aria-label="Buscar ventas"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
          />
        </label>
        <div className="chip-row" role="radiogroup" aria-label="Filtrar por cobro">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                "min-h-10 rounded-full border px-3.5 text-sm font-semibold",
                statusFilter === filter.value
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                  : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)]",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredSales.length === 0 ? (
        <EmptyState
          title={hasSearchQuery || hasStatusFilter ? "Ninguna venta coincide" : "Todavía no hay ventas"}
          description={
            hasSearchQuery || hasStatusFilter
              ? "Probá con otra búsqueda o cambiá el filtro."
              : "Tocá «Nueva venta» o el botón Cargar para registrar la primera."
          }
          icon={CircleDollarSign}
        />
      ) : (
        <>
          <ul className="grid gap-2 md:hidden">
            {filteredSales.map((sale) => {
              const groups = groupSaleItems(sale.items);
              const balance = getSaleBalance(sale.totalAmount, sale.amountPaid);

              return (
                <li key={sale.id}>
                  <button
                    type="button"
                    onClick={() => setDetailSaleId(sale.id)}
                    className={cn(
                      "grid w-full gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left active:bg-[var(--surface-2)]",
                      sale.isVoided && "opacity-60",
                    )}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className={cn("block truncate text-base font-semibold", sale.isVoided && "line-through")}>
                          {sale.contactName ?? "Sin cliente"}
                        </span>
                        <span className="block text-[13px] text-[var(--muted)]">
                          {formatDate(sale.saleDate)} · {sale.channelName ?? "Sin canal"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums">
                          {formatCurrency(sale.totalAmount)}
                        </span>
                        {!sale.isVoided && sale.paymentStatus !== "paid" ? (
                          <span className="block text-[13px] font-semibold text-[var(--amber-ink)] tabular-nums">
                            Debe {formatCurrency(balance)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="truncate text-sm text-[var(--ink-2)]">
                      {groups.map((group) => describeGroup(group)).join(" · ")}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex flex-wrap gap-1.5">
                        {sale.isVoided ? (
                          <Badge tone="danger">Anulada</Badge>
                        ) : (
                          <Badge tone={getPaymentTone(sale.paymentStatus)}>{getPaymentLabel(sale.paymentStatus)}</Badge>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[var(--muted)]" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Panel className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[15px]">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[13px] text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Productos</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Cobro</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale) => {
                    const groups = groupSaleItems(sale.items);
                    return (
                      <tr key={sale.id} className={cn("border-t border-[var(--line)] align-top", sale.isVoided && "opacity-60")}>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(sale.saleDate)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{sale.contactName ?? "Sin cliente"}</p>
                          <p className="text-[13px] text-[var(--muted)]">{sale.totalUnits} unidades</p>
                        </td>
                        <td className="max-w-[320px] px-4 py-3">
                          {groups.slice(0, 2).map((group) => (
                            <p key={group.key} className="truncate">
                              {describeGroup(group)}
                            </p>
                          ))}
                          {groups.length > 2 ? (
                            <p className="text-[13px] text-[var(--muted)]">y {groups.length - 2} más</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[var(--ink-2)]">{sale.channelName ?? "Sin canal"}</td>
                        <td className="px-4 py-3">
                          {sale.isVoided ? (
                            <Badge tone="danger">Anulada</Badge>
                          ) : (
                            <Badge tone={getPaymentTone(sale.paymentStatus)}>{getPaymentLabel(sale.paymentStatus)}</Badge>
                          )}
                          <PaymentSummary sale={sale} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <Button type="button" variant="ghost" onClick={() => setDetailSaleId(sale.id)}>
                            Ver
                          </Button>
                          {!sale.isVoided && sale.paymentStatus !== "paid" ? (
                            <Button type="button" variant="secondary" onClick={() => setSelectedSaleId(sale.id)}>
                              Cobrar
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {selectedSale ? (
        <PaymentModal
          sale={selectedSale}
          role={role}
          onClose={() => setSelectedSaleId(null)}
          onSaleUpdated={(updatedSale) => {
            setSaleRecords((current) => upsertSale(current, updatedSale));
          }}
        />
      ) : null}
      {detailSale && !selectedSale && !reverseSale ? (
        <SaleDetailModal
          sale={detailSale}
          isAdmin={isAdmin}
          onClose={() => setDetailSaleId(null)}
          onEditPayment={() => setSelectedSaleId(detailSale.id)}
          onReverse={() => setReverseSaleId(detailSale.id)}
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
