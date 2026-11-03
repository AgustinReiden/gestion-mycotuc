"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { Archive, Edit3, Plus, RotateCcw, Search, Settings2, ShoppingBasket } from "lucide-react";
import { reverseSupplyPurchaseAction } from "@/actions/supplies";
import { PurchaseHistoryPanel } from "@/components/app/purchase-history-panel";
import { StockHistoryPanel } from "@/components/app/stock-history-panel";
import { ActionNotice } from "@/components/forms/action-notice";
import { PurchaseForm } from "@/components/forms/purchase-form";
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form";
import { SupplyForm } from "@/components/forms/supply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type {
  AppRole,
  ContactRecord,
  InventoryMovementRecord,
  PurchaseRecord,
  SupplyRecord,
} from "@/lib/domain";
import { getStockValue as getCostValue } from "@/lib/finance";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import { formatCurrency, formatDate, sumBy } from "@/lib/utils";

type SuppliesShellProps = {
  supplies: SupplyRecord[];
  suppliers: ContactRecord[];
  purchases: PurchaseRecord[];
  movements: InventoryMovementRecord[];
  role: AppRole;
};

function getStockValue(supply: SupplyRecord) {
  return getCostValue(supply.currentStock, supply.avgCost);
}

type PurchaseSuccessResult = {
  purchase: PurchaseRecord;
  expense: import("@/lib/domain").ExpenseRecord | null;
  supplies: SupplyRecord[];
  movements: InventoryMovementRecord[];
};

type AdjustmentSuccessResult = {
  movement: InventoryMovementRecord;
  supply: SupplyRecord | null;
};

function sortSupplies(list: SupplyRecord[]) {
  return [...list].sort((left, right) =>
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }),
  );
}

function sortPurchases(list: PurchaseRecord[]) {
  return [...list].sort((left, right) => {
    const purchaseDateComparison = right.purchaseDate.localeCompare(left.purchaseDate);

    if (purchaseDateComparison !== 0) {
      return purchaseDateComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function sortMovements(list: InventoryMovementRecord[]) {
  return [...list].sort((left, right) => {
    const movementDateComparison = right.movementDate.localeCompare(left.movementDate);

    if (movementDateComparison !== 0) {
      return movementDateComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

/** Las acciones no devuelven el costo promedio: se conserva el que llego del servidor. */
function withPreviousCost(list: SupplyRecord[], supply: SupplyRecord): SupplyRecord {
  const previous = list.find((entry) => entry.id === supply.id);
  return { ...supply, avgCost: supply.avgCost ?? previous?.avgCost ?? null };
}

function upsertSupply(list: SupplyRecord[], supply: SupplyRecord) {
  return sortSupplies([
    withPreviousCost(list, supply),
    ...list.filter((entry) => entry.id !== supply.id),
  ]);
}

function mergeSupplies(list: SupplyRecord[], nextSupplies: SupplyRecord[]) {
  const registry = new Map(list.map((supply) => [supply.id, supply]));

  nextSupplies.forEach((supply) => {
    registry.set(supply.id, withPreviousCost(list, supply));
  });

  return sortSupplies(Array.from(registry.values()));
}

function mergePurchases(list: PurchaseRecord[], nextPurchases: PurchaseRecord[], limit: number) {
  return sortPurchases([
    ...nextPurchases,
    ...list.filter((entry) => !nextPurchases.some((purchase) => purchase.id === entry.id)),
  ]).slice(0, limit);
}

function mergeMovements(
  list: InventoryMovementRecord[],
  nextMovements: InventoryMovementRecord[],
  limit: number,
) {
  return sortMovements([
    ...nextMovements,
    ...list.filter((entry) => !nextMovements.some((movement) => movement.id === entry.id)),
  ]).slice(0, limit);
}

function NewSupplyModal({
  isAdmin,
  onSupplySaved,
}: {
  isAdmin: boolean;
  onSupplySaved: (supply: SupplyRecord) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
        Nuevo insumo
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo insumo"
        description="Mantiene al día el catálogo base para compras y producción."
      >
        <SupplyForm
          supply={null}
          isAdmin={isAdmin}
          onSuccess={(supply) => {
            setOpen(false);
            onSupplySaved(supply);
          }}
        />
      </Modal>
    </>
  );
}

function NewPurchaseModal({
  suppliers,
  supplies,
  onPurchaseSaved,
}: {
  suppliers: ContactRecord[];
  supplies: SupplyRecord[];
  onPurchaseSaved: (result: PurchaseSuccessResult) => void;
}) {
  const [open, setOpen] = useQuickCreate("compra");

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <ShoppingBasket className="h-5 w-5" />
        Registrar compra
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar compra de insumos"
        description="La compra aumenta stock y crea automáticamente el gasto asociado."
        size="xl"
      >
        <PurchaseForm
          suppliers={suppliers}
          supplies={supplies}
          onSuccess={(result) => {
            setOpen(false);
            onPurchaseSaved(result);
          }}
        />
      </Modal>
    </>
  );
}

function EditSupplyModal({
  supply,
  isAdmin,
  onClose,
  onSupplySaved,
}: {
  supply: SupplyRecord;
  isAdmin: boolean;
  onClose: () => void;
  onSupplySaved: (supply: SupplyRecord) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar insumo"
      description="Mantiene al día el catálogo base para compras y producción."
    >
      <SupplyForm
        supply={supply}
        isAdmin={isAdmin}
        onSuccess={(updatedSupply) => {
          onSupplySaved(updatedSupply);
          onClose();
        }}
      />
    </Modal>
  );
}

function AdjustSupplyStockModal({
  supply,
  onClose,
  onAdjustmentApplied,
}: {
  supply: SupplyRecord;
  onClose: () => void;
  onAdjustmentApplied: (result: AdjustmentSuccessResult) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Ajustar stock"
      description="Deja trazabilidad de correcciones manuales sobre inventario."
    >
      <StockAdjustmentForm
        entityType="supply"
        entityId={supply.id}
        entityLabel={supply.name}
        onSuccess={(result) => {
          onAdjustmentApplied(result);
          onClose();
        }}
      />
    </Modal>
  );
}

function ReversePurchaseModal({
  purchase,
  onClose,
  onPurchaseReversed,
}: {
  purchase: PurchaseRecord;
  onClose: () => void;
  onPurchaseReversed: (result: PurchaseSuccessResult) => void;
}) {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open
      onClose={onClose}
      title="Anular compra"
      description="Registrá movimientos de reversa y anulá el gasto asociado."
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-3 text-[15px] text-[var(--ink-2)]">
          La anulación descontará los insumos comprados. Si ya fueron consumidos y el stock quedaría
          negativo, la base rechazará la operación.
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink-2)]">
          Motivo
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-base font-normal focus:border-[var(--foreground)]"
            rows={4}
            placeholder="Error de carga, devolución al proveedor o factura anulada."
          />
        </label>
        {feedback ? <ActionNotice tone="error" message={feedback} /> : null}
        <div className="sheet-actions flex items-center justify-end gap-2">
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
                const result = await reverseSupplyPurchaseAction({ id: purchase.id, reason });
                if (result.success && result.data) {
                  onPurchaseReversed(result.data);
                  onClose();
                  return;
                }

                setFeedback(result.error ?? result.message);
              });
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Anular compra
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SuppliesShell({
  supplies,
  suppliers,
  purchases,
  movements,
  role,
}: SuppliesShellProps) {
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [supplyRecords, setSupplyRecords] = useState(() => sortSupplies(supplies));
  const [purchaseRecords, setPurchaseRecords] = useState(() => sortPurchases(purchases));
  const [movementRecords, setMovementRecords] = useState(() => sortMovements(movements));
  const [selectedSupplyId, setSelectedSupplyId] = useState<string | null>(null);
  const [adjustmentSupplyId, setAdjustmentSupplyId] = useState<string | null>(null);
  const [reversePurchaseId, setReversePurchaseId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;
  const purchaseHistoryLimit = Math.max(purchases.length, 8);
  const movementHistoryLimit = Math.max(movements.length, 12);
  const selectedSupply = selectedSupplyId
    ? supplyRecords.find((supply) => supply.id === selectedSupplyId) ?? null
    : null;
  const adjustmentSupply = adjustmentSupplyId
    ? supplyRecords.find((supply) => supply.id === adjustmentSupplyId) ?? null
    : null;
  const reversePurchase = reversePurchaseId
    ? purchaseRecords.find((purchase) => purchase.id === reversePurchaseId) ?? null
    : null;

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedSupplies, setSyncedSupplies] = useState(supplies);
  if (syncedSupplies !== supplies) {
    setSyncedSupplies(supplies);
    setSupplyRecords(sortSupplies(supplies));
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedPurchases, setSyncedPurchases] = useState(purchases);
  if (syncedPurchases !== purchases) {
    setSyncedPurchases(purchases);
    setPurchaseRecords(sortPurchases(purchases));
  }

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedMovements, setSyncedMovements] = useState(movements);
  if (syncedMovements !== movements) {
    setSyncedMovements(movements);
    setMovementRecords(sortMovements(movements));
  }

  const filteredSupplies = supplyRecords.filter((supply) =>
    supply.name.toLowerCase().includes(deferredSearch.toLowerCase()),
  );
  const totalStockValue = sumBy(supplyRecords, (supply) => getStockValue(supply) ?? 0);

  return (
    <div className="page-grid">
      <div className="grid gap-3">
        {isAdmin ? (
          <Panel className="p-3.5 sm:p-4">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Valor del stock (costo promedio)</p>
            <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums">
              {formatCurrency(totalStockValue)}
            </p>
          </Panel>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
          <NewPurchaseModal
            suppliers={suppliers}
            supplies={supplyRecords}
            onPurchaseSaved={(result) => {
              setPurchaseRecords((current) =>
                mergePurchases(current, [result.purchase], purchaseHistoryLimit),
              );
              setSupplyRecords((current) => mergeSupplies(current, result.supplies));
              setMovementRecords((current) =>
                mergeMovements(current, result.movements, movementHistoryLimit),
              );
            }}
          />
          <NewSupplyModal
            isAdmin={isAdmin}
            onSupplySaved={(supply) => {
              setSupplyRecords((current) => upsertSupply(current, supply));
            }}
          />
        </div>
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar insumo"
            aria-label="Buscar insumos"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
          />
        </label>
      </div>

      {filteredSupplies.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasSearchQuery ? "No encontramos insumos" : "Todavía no hay insumos"}
            description={
              hasSearchQuery
                ? "Probá con otro término de búsqueda o creá un insumo nuevo."
                : "Creá insumos base para empezar a registrar compras y movimientos."
            }
            icon={Archive}
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="divide-y divide-[var(--line)] md:hidden">
            {filteredSupplies.map((supply) => (
              <article key={supply.id} className="space-y-3 bg-[var(--surface)] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{supply.name}</h3>
                    {supply.notes ? (
                      <p className="mt-1 text-sm text-[var(--muted)]">{supply.notes}</p>
                    ) : null}
                  </div>
                  <Badge tone={supply.currentStock <= supply.minStock ? "danger" : "success"}>
                    {supply.currentStock <= supply.minStock ? "Reponer" : "OK"}
                  </Badge>
                </div>

                <div className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-sm sm:grid-cols-3">
                  <p>
                    Stock: {supply.currentStock} {supply.unit}
                  </p>
                  <p>
                    Mínimo: {supply.minStock} {supply.unit}
                  </p>
                  <p>Última compra: {formatDate(supply.lastPurchaseAt)}</p>
                  {isAdmin && supply.avgCost !== null ? (
                    <>
                      <p>Costo promedio: {supply.avgCost > 0 ? formatCurrency(supply.avgCost) : "sin costo"}</p>
                      {supply.avgCost > 0 ? <p>Valor stock: {formatCurrency(getStockValue(supply) ?? 0)}</p> : null}
                    </>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setSelectedSupplyId(supply.id)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setAdjustmentSupplyId(supply.id)}
                  >
                    <Settings2 className="h-4 w-4" />
                    Ajustar
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">Stock actual</th>
                  <th className="px-4 py-3 font-medium">Mínimo</th>
                  <th className="px-4 py-3 font-medium">Última compra</th>
                  {isAdmin ? (
                    <>
                      <th className="px-4 py-3 font-medium">Costo promedio</th>
                      <th className="px-4 py-3 font-medium">Valor stock</th>
                    </>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupplies.map((supply) => (
                  <tr key={supply.id} className="border-t border-[var(--line)] bg-[var(--surface)]">
                    <td className="px-4 py-4">
                      <p className="font-semibold">{supply.name}</p>
                      {supply.notes ? <p className="text-xs text-[var(--muted)]">{supply.notes}</p> : null}
                    </td>
                    <td className="px-4 py-4">
                      {supply.currentStock} {supply.unit}
                    </td>
                    <td className="px-4 py-4">
                      {supply.minStock} {supply.unit}
                    </td>
                    <td className="px-4 py-4">{formatDate(supply.lastPurchaseAt)}</td>
                    {isAdmin ? (
                      <>
                        <td className="px-4 py-4">
                          {supply.avgCost === null ? "—" : supply.avgCost > 0 ? formatCurrency(supply.avgCost) : "Sin costo"}
                        </td>
                        <td className="px-4 py-4">
                          {supply.avgCost === null || supply.avgCost === 0 ? "—" : formatCurrency(getStockValue(supply) ?? 0)}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-4">
                      <Badge tone={supply.currentStock <= supply.minStock ? "danger" : "success"}>
                        {supply.currentStock <= supply.minStock ? "Reponer" : "OK"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setSelectedSupplyId(supply.id)}>
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setAdjustmentSupplyId(supply.id)}>
                          <Settings2 className="h-4 w-4" />
                          Ajustar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
        <PurchaseHistoryPanel
          purchases={purchaseRecords}
          onReversePurchase={(purchase) => setReversePurchaseId(purchase.id)}
        />
        <StockHistoryPanel
          title="Historial de stock de insumos"
          description="Entradas por compra, salidas por producción y ajustes manuales."
          movements={movementRecords}
        />
      </div>

      {selectedSupply ? (
        <EditSupplyModal
          supply={selectedSupply}
          isAdmin={isAdmin}
          onClose={() => setSelectedSupplyId(null)}
          onSupplySaved={(updatedSupply) => {
            setSupplyRecords((current) => upsertSupply(current, updatedSupply));
          }}
        />
      ) : null}
      {adjustmentSupply ? (
        <AdjustSupplyStockModal
          supply={adjustmentSupply}
          onClose={() => setAdjustmentSupplyId(null)}
          onAdjustmentApplied={(result) => {
            if (result.supply) {
              setSupplyRecords((current) => upsertSupply(current, result.supply!));
            }
            setMovementRecords((current) =>
              mergeMovements(current, [result.movement], movementHistoryLimit),
            );
          }}
        />
      ) : null}
      {reversePurchase ? (
        <ReversePurchaseModal
          purchase={reversePurchase}
          onClose={() => setReversePurchaseId(null)}
          onPurchaseReversed={(result) => {
            setPurchaseRecords((current) =>
              mergePurchases(current, [result.purchase], purchaseHistoryLimit),
            );
            setSupplyRecords((current) => mergeSupplies(current, result.supplies));
            setMovementRecords((current) =>
              mergeMovements(current, result.movements, movementHistoryLimit),
            );
          }}
        />
      ) : null}
    </div>
  );
}
