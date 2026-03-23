"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Plus, Sprout, Warehouse } from "lucide-react";
import { ProductionBatchForm } from "@/components/forms/production-batch-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ProductRecord, ProductionBatchRecord, SupplyRecord } from "@/lib/domain";
import { cn, formatDate } from "@/lib/utils";

type ProductionShellProps = {
  batches: ProductionBatchRecord[];
  products: ProductRecord[];
  supplies: SupplyRecord[];
};

function getStatusTone(status: ProductionBatchRecord["status"]) {
  if (status === "completed") return "success";
  if (status === "active") return "accent";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function getStatusLabel(status: ProductionBatchRecord["status"]) {
  if (status === "completed") return "Completado";
  if (status === "active") return "En proceso";
  if (status === "cancelled") return "Cancelado";
  return "Borrador";
}

function sortBatches(list: ProductionBatchRecord[]) {
  return [...list].sort((left, right) => {
    const startedAtComparison = right.startedAt.localeCompare(left.startedAt);

    if (startedAtComparison !== 0) {
      return startedAtComparison;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

function upsertBatch(list: ProductionBatchRecord[], batch: ProductionBatchRecord) {
  return sortBatches([batch, ...list.filter((entry) => entry.id !== batch.id)]);
}

function NewBatchModal({
  products,
  supplies,
  onBatchSaved,
}: {
  products: ProductRecord[];
  supplies: SupplyRecord[];
  onBatchSaved: (batch: ProductionBatchRecord) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo lote
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo lote" description="Al completar el lote se impactan insumos y productos en inventario." size="xl">
        <ProductionBatchForm
          batch={null}
          products={products}
          supplies={supplies}
          onSuccess={(batch) => {
            setOpen(false);
            onBatchSaved(batch);
          }}
        />
      </Modal>
    </>
  );
}

function EditBatchModal({
  batch,
  products,
  supplies,
  onClose,
  onBatchSaved,
}: {
  batch: ProductionBatchRecord;
  products: ProductRecord[];
  supplies: SupplyRecord[];
  onClose: () => void;
  onBatchSaved: (batch: ProductionBatchRecord) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Editar lote" description="Al completar el lote se impactan insumos y productos en inventario." size="xl">
      <ProductionBatchForm
        batch={batch}
        products={products}
        supplies={supplies}
        onSuccess={(updatedBatch) => {
          onBatchSaved(updatedBatch);
          onClose();
        }}
      />
    </Modal>
  );
}

export function ProductionShell({ batches, products, supplies }: ProductionShellProps) {
  const [search, setSearch] = useState("");
  const [batchRecords, setBatchRecords] = useState(() => sortBatches(batches));
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;
  const selectedBatch = selectedBatchId
    ? batchRecords.find((batch) => batch.id === selectedBatchId) ?? null
    : null;

  useEffect(() => {
    setBatchRecords(sortBatches(batches));
  }, [batches]);

  const filteredBatches = batchRecords.filter((batch) => {
    const query = deferredSearch.toLowerCase();
    return (
      batch.productName.toLowerCase().includes(query) ||
      batch.status.toLowerCase().includes(query) ||
      batch.inputs.some((input) => input.supplyName.toLowerCase().includes(query))
    );
  });

  return (
    <div className="page-grid">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Produccion</p>
            <h2 className="mt-2 text-3xl font-semibold">Lotes, consumos y rendimiento</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sigue cada lote simple y registra impacto real sobre insumos y producto terminado.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:min-w-[260px] sm:flex-1">
              <Warehouse className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lote o insumo..."
                aria-label="Buscar lotes de produccion"
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <NewBatchModal
              products={products}
              supplies={supplies}
              onBatchSaved={(batch) => {
                setBatchRecords((current) => upsertBatch(current, batch));
              }}
            />
          </div>
        </div>
      </Panel>

      {filteredBatches.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasSearchQuery ? "No encontramos lotes" : "Todavia no hay lotes"}
            description={
              hasSearchQuery
                ? "Prueba otro termino de busqueda o crea un lote nuevo."
                : "Crea un lote para empezar a seguir produccion y rendimiento."
            }
            icon={Sprout}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredBatches.map((batch) => (
            <Panel key={batch.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6b7b6c]">Lote / Cepa</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#2d3329]">{batch.productName}</h3>
                </div>
                <Badge tone={getStatusTone(batch.status)}>{getStatusLabel(batch.status)}</Badge>
              </div>

              {batch.status !== "cancelled" ? (
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#e8e6d2]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      batch.status === "draft" ? "w-1/3 bg-[#b77f28]" : batch.status === "active" ? "w-2/3 bg-[#3b5f42]" : "w-full bg-[#27432d]"
                    )}
                  />
                </div>
              ) : (
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#f8e4e0]">
                  <div className="h-full w-full rounded-full bg-[#a54b3d]" />
                </div>
              )}

              <div className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-[#fdfcf8] p-5 shadow-sm md:grid-cols-4">
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#798075]">Inicio</p>
                  <p className="mt-2 text-sm font-semibold">{formatDate(batch.startedAt)}</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#798075]">Cierre</p>
                  <p className="mt-2 text-sm font-semibold">{formatDate(batch.completedAt)}</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#798075]">Esperado</p>
                  <p className="mt-2 text-sm font-semibold">{batch.expectedQty ?? "-"} un.</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#798075]">Real</p>
                  <p className="mt-2 text-sm font-semibold text-[#3b5f42]">{batch.actualQty ?? "-"} un.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--line)] bg-[#faf9f5] p-5">
                  <p className="text-sm font-semibold text-[#2d3329]">Insumos consumidos (Sustrato/Desove)</p>
                  <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                    {batch.inputs.map((input) => (
                      <div key={input.id} className="flex items-center justify-between border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                        <span>{input.supplyName}</span>
                        <span className="font-semibold text-[#2d3329]">x {input.quantity}</span>
                      </div>
                    ))}
                    {batch.inputs.length === 0 && <p className="text-sm italic">Sin consumos registrados.</p>}
                  </div>
                </div>
                <div className="rounded-[24px] border border-[var(--line)] bg-[#faf9f5] p-5">
                  <p className="text-sm font-semibold text-[#2d3329]">Cosecha (Salida)</p>
                  <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                    {batch.outputs.map((output) => (
                      <div key={output.id} className="flex items-center justify-between border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                        <span>{output.productName}</span>
                        <span className="font-semibold text-[#3b5f42]">x {output.quantity}</span>
                      </div>
                    ))}
                    {batch.outputs.length === 0 && <p className="text-sm italic">Pendiente de cosecha.</p>}
                  </div>
                </div>
              </div>

              {batch.notes ? <p className="text-sm text-[var(--muted)]">{batch.notes}</p> : null}

              <div className="mt-auto flex justify-end">
                <Button type="button" variant="secondary" onClick={() => setSelectedBatchId(batch.id)}>
                  Editar lote
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {selectedBatch ? (
        <EditBatchModal
          batch={selectedBatch}
          products={products}
          supplies={supplies}
          onClose={() => setSelectedBatchId(null)}
          onBatchSaved={(batch) => {
            setBatchRecords((current) => upsertBatch(current, batch));
          }}
        />
      ) : null}
    </div>
  );
}
