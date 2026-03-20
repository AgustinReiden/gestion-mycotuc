"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Archive, Edit3, Plus, Search, Settings2, ShoppingBasket } from "lucide-react";
import { PurchaseHistoryPanel } from "@/components/app/purchase-history-panel";
import { StockHistoryPanel } from "@/components/app/stock-history-panel";
import { PurchaseForm } from "@/components/forms/purchase-form";
import { StockAdjustmentForm } from "@/components/forms/stock-adjustment-form";
import { SupplyForm } from "@/components/forms/supply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type {
  ContactRecord,
  InventoryMovementRecord,
  PurchaseRecord,
  SupplyRecord,
} from "@/lib/domain";
import { formatDate } from "@/lib/utils";

type SuppliesShellProps = {
  supplies: SupplyRecord[];
  suppliers: ContactRecord[];
  purchases: PurchaseRecord[];
  movements: InventoryMovementRecord[];
};

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

function upsertSupply(list: SupplyRecord[], supply: SupplyRecord) {
  return sortSupplies([supply, ...list.filter((entry) => entry.id !== supply.id)]);
}

function mergeSupplies(list: SupplyRecord[], nextSupplies: SupplyRecord[]) {
  const registry = new Map(list.map((supply) => [supply.id, supply]));

  nextSupplies.forEach((supply) => {
    registry.set(supply.id, supply);
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

function NewSupplyModal({ onSupplySaved }: { onSupplySaved: (supply: SupplyRecord) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo insumo
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo insumo"
        description="Mantiene al dia el catalogo base para compras y produccion."
      >
        <SupplyForm
          supply={null}
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <ShoppingBasket className="h-4 w-4" />
        Registrar compra
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar compra de insumos"
        description="La compra aumenta stock y crea automaticamente el gasto asociado."
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
  onClose,
  onSupplySaved,
}: {
  supply: SupplyRecord;
  onClose: () => void;
  onSupplySaved: (supply: SupplyRecord) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar insumo"
      description="Mantiene al dia el catalogo base para compras y produccion."
    >
      <SupplyForm
        supply={supply}
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

export function SuppliesShell({
  supplies,
  suppliers,
  purchases,
  movements,
}: SuppliesShellProps) {
  const [search, setSearch] = useState("");
  const [supplyRecords, setSupplyRecords] = useState(() => sortSupplies(supplies));
  const [purchaseRecords, setPurchaseRecords] = useState(() => sortPurchases(purchases));
  const [movementRecords, setMovementRecords] = useState(() => sortMovements(movements));
  const [selectedSupplyId, setSelectedSupplyId] = useState<string | null>(null);
  const [adjustmentSupplyId, setAdjustmentSupplyId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const purchaseHistoryLimit = Math.max(purchases.length, 8);
  const movementHistoryLimit = Math.max(movements.length, 12);
  const selectedSupply = selectedSupplyId
    ? supplyRecords.find((supply) => supply.id === selectedSupplyId) ?? null
    : null;
  const adjustmentSupply = adjustmentSupplyId
    ? supplyRecords.find((supply) => supply.id === adjustmentSupplyId) ?? null
    : null;

  useEffect(() => {
    setSupplyRecords(sortSupplies(supplies));
  }, [supplies]);

  useEffect(() => {
    setPurchaseRecords(sortPurchases(purchases));
  }, [purchases]);

  useEffect(() => {
    setMovementRecords(sortMovements(movements));
  }, [movements]);

  const filteredSupplies = supplyRecords.filter((supply) =>
    supply.name.toLowerCase().includes(deferredSearch.toLowerCase()),
  );

  return (
    <div className="page-grid">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Insumos</p>
            <h2 className="mt-2 text-3xl font-semibold">Reposicion y stock de fabrica</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Controla existencias, compras ligadas a gastos y ajustes manuales de inventario.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:min-w-[260px] sm:flex-1">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar insumo..."
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
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
              onSupplySaved={(supply) => {
                setSupplyRecords((current) => upsertSupply(current, supply));
              }}
            />
          </div>
        </div>
      </Panel>

      {filteredSupplies.length === 0 ? (
        <Panel>
          <EmptyState
            title="No encontramos insumos"
            description="Crea insumos base o cambia el termino de busqueda."
            icon={Archive}
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="divide-y divide-[var(--line)] md:hidden">
            {filteredSupplies.map((supply) => (
              <article key={supply.id} className="space-y-4 bg-white/80 p-4">
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

                <div className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[#f8f6ef] p-4 text-sm sm:grid-cols-3">
                  <p>
                    Stock: {supply.currentStock} {supply.unit}
                  </p>
                  <p>
                    Minimo: {supply.minStock} {supply.unit}
                  </p>
                  <p>Ultima compra: {formatDate(supply.lastPurchaseAt)}</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setSelectedSupplyId(supply.id)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
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
              <thead className="bg-[#f4f1e8] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Insumo</th>
                  <th className="px-4 py-3 font-medium">Stock actual</th>
                  <th className="px-4 py-3 font-medium">Minimo</th>
                  <th className="px-4 py-3 font-medium">Ultima compra</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSupplies.map((supply) => (
                  <tr key={supply.id} className="border-t border-[var(--line)] bg-white/80">
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

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <PurchaseHistoryPanel purchases={purchaseRecords} />
        <StockHistoryPanel
          title="Historial de stock de insumos"
          description="Entradas por compra, salidas por produccion y ajustes manuales."
          movements={movementRecords}
        />
      </div>

      {selectedSupply ? (
        <EditSupplyModal
          supply={selectedSupply}
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
    </div>
  );
}
