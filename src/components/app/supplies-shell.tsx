"use client";

import { useDeferredValue, useState } from "react";
import { Archive, Edit3, Plus, Search, Settings2, ShoppingBasket } from "lucide-react";
import { useRouter } from "next/navigation";
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
import type { ContactRecord, InventoryMovementRecord, PurchaseRecord, SupplyRecord } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

type SuppliesShellProps = {
  supplies: SupplyRecord[];
  suppliers: ContactRecord[];
  purchases: PurchaseRecord[];
  movements: InventoryMovementRecord[];
};

export function SuppliesShell({ supplies, suppliers, purchases, movements }: SuppliesShellProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<SupplyRecord | null>(null);
  const [adjustmentSupply, setAdjustmentSupply] = useState<SupplyRecord | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const filteredSupplies = supplies.filter((supply) =>
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

          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex min-w-[260px] items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar insumo..."
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => setPurchaseOpen(true)}>
              <ShoppingBasket className="h-4 w-4" />
              Registrar compra
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo insumo
            </Button>
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
          <div className="overflow-x-auto">
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
                        <Button type="button" variant="ghost" onClick={() => setSelectedSupply(supply)}>
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setAdjustmentSupply(supply)}>
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
        <PurchaseHistoryPanel purchases={purchases} />
        <StockHistoryPanel
          title="Historial de stock de insumos"
          description="Entradas por compra, salidas por produccion y ajustes manuales."
          movements={movements}
        />
      </div>

      <Modal
        open={createOpen || selectedSupply !== null}
        onClose={() => {
          setCreateOpen(false);
          setSelectedSupply(null);
        }}
        title={selectedSupply ? "Editar insumo" : "Nuevo insumo"}
        description="Mantiene al dia el catalogo base para compras y produccion."
      >
        <SupplyForm
          supply={selectedSupply}
          onSuccess={() => {
            setCreateOpen(false);
            setSelectedSupply(null);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        title="Registrar compra de insumos"
        description="La compra aumenta stock y crea automaticamente el gasto asociado."
        size="xl"
      >
        <PurchaseForm
          suppliers={suppliers}
          supplies={supplies}
          onSuccess={() => {
            setPurchaseOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        open={adjustmentSupply !== null}
        onClose={() => setAdjustmentSupply(null)}
        title="Ajustar stock"
        description="Deja trazabilidad de correcciones manuales sobre inventario."
      >
        {adjustmentSupply ? (
          <StockAdjustmentForm
            entityType="supply"
            entityId={adjustmentSupply.id}
            entityLabel={adjustmentSupply.name}
            onSuccess={() => {
              setAdjustmentSupply(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
