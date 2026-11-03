"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { Plus, RotateCcw, Search, Sprout } from "lucide-react";
import { reverseProductionBatchAction } from "@/actions/production";
import { ProductionBatchForm } from "@/components/forms/production-batch-form";
import { ActionNotice } from "@/components/forms/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { AppRole, ProductRecord, ProductionBatchRecord, SupplyRecord } from "@/lib/domain";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type ProductionShellProps = {
  batches: ProductionBatchRecord[];
  products: ProductRecord[];
  supplies: SupplyRecord[];
  role: AppRole;
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

/** Las acciones no devuelven costos: se conservan los que ya llegaron del servidor. */
function upsertBatch(list: ProductionBatchRecord[], batch: ProductionBatchRecord) {
  const previous = list.find((entry) => entry.id === batch.id);
  const merged = previous
    ? {
        ...batch,
        totalCost: batch.totalCost ?? previous.totalCost,
        unitCost: batch.unitCost ?? previous.unitCost,
        inputs: batch.inputs.map((input) => ({
          ...input,
          unitCost:
            input.unitCost ?? previous.inputs.find((entry) => entry.id === input.id)?.unitCost ?? null,
        })),
      }
    : batch;

  return sortBatches([merged, ...list.filter((entry) => entry.id !== batch.id)]);
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
  const [open, setOpen] = useQuickCreate("lote");

  return (
    <>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
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

function ReverseBatchModal({
  batch,
  onClose,
  onBatchReversed,
}: {
  batch: ProductionBatchRecord;
  onClose: () => void;
  onBatchReversed: (batch: ProductionBatchRecord) => void;
}) {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open
      onClose={onClose}
      title="Anular lote"
      description="Cancelá el lote y revierte inventario si ya había sido completado."
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-3 text-[15px] text-[var(--ink-2)]">
          Si el lote ya impactó inventario, se devolverán insumos y se descontarán salidas. La base
          rechazará la anulación si los productos quedarían con stock negativo.
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--ink-2)]">
          Motivo
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-base font-normal focus:border-[var(--foreground)]"
            rows={4}
            placeholder="Error de carga, lote descartado o control de calidad."
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
                const result = await reverseProductionBatchAction({ id: batch.id, reason });
                if (result.success && result.data) {
                  onBatchReversed(result.data.batch);
                  onClose();
                  return;
                }

                setFeedback(result.error ?? result.message);
              });
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Anular lote
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ProductionShell({ batches, products, supplies, role }: ProductionShellProps) {
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [batchRecords, setBatchRecords] = useState(() => sortBatches(batches));
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [reverseBatchId, setReverseBatchId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasSearchQuery = deferredSearch.trim().length > 0;
  const selectedBatch = selectedBatchId
    ? batchRecords.find((batch) => batch.id === selectedBatchId) ?? null
    : null;
  const reverseBatch = reverseBatchId
    ? batchRecords.find((batch) => batch.id === reverseBatchId) ?? null
    : null;

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedBatches, setSyncedBatches] = useState(batches);
  if (syncedBatches !== batches) {
    setSyncedBatches(batches);
    setBatchRecords(sortBatches(batches));
  }

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
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar lote o insumo"
            aria-label="Buscar lotes de producción"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
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

      {filteredBatches.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasSearchQuery ? "No encontramos lotes" : "Todavía no hay lotes"}
            description={
              hasSearchQuery
                ? "Probá con otro término de búsqueda o creá un lote nuevo."
                : "Creá un lote para empezar a seguir producción y rendimiento."
            }
            icon={Sprout}
          />
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredBatches.map((batch) => (
            <Panel key={batch.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Lote / Cepa</p>
                  <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">{batch.productName}</h3>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone={getStatusTone(batch.status)}>{getStatusLabel(batch.status)}</Badge>
                  {batch.isVoided ? <Badge tone="danger">Anulado</Badge> : null}
                </div>
              </div>

              {batch.status !== "cancelled" ? (
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      batch.status === "draft" ? "w-1/3 bg-[var(--amber)]" : batch.status === "active" ? "w-2/3 bg-[var(--moss)]" : "w-full bg-[var(--foreground)]"
                    )}
                  />
                </div>
              ) : (
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--danger-soft)]">
                  <div className="h-full w-full rounded-full bg-[var(--danger)]" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5 md:grid-cols-4">
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Inicio</p>
                  <p className="mt-1 text-sm font-semibold">{formatDate(batch.startedAt)}</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Cierre</p>
                  <p className="mt-1 text-sm font-semibold">{formatDate(batch.completedAt)}</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Esperado</p>
                  <p className="mt-1 text-sm font-semibold">{batch.expectedQty ?? "-"} un.</p>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--muted)]">Real</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--moss)]">{batch.actualQty ?? "-"} un.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Insumos consumidos (Sustrato/Desove)</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                    {batch.inputs.map((input) => (
                      <div key={input.id} className="flex items-center justify-between border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                        <span>{input.supplyName}</span>
                        <span className="font-semibold text-[var(--foreground)]">
                          x {input.quantity}
                          {isAdmin && input.unitCost !== null ? (
                            <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                              {formatCurrency(input.unitCost)} c/u
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                    {batch.inputs.length === 0 && <p className="text-sm italic">Sin consumos registrados.</p>}
                  </div>
                </div>
                <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Cosecha (Salida)</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
                    {batch.outputs.map((output) => (
                      <div key={output.id} className="flex items-center justify-between border-b border-[var(--line)] pb-2 last:border-0 last:pb-0">
                        <span>{output.productName}</span>
                        <span className="font-semibold text-[var(--moss)]">x {output.quantity}</span>
                      </div>
                    ))}
                    {batch.outputs.length === 0 && <p className="text-sm italic">Pendiente de cosecha.</p>}
                  </div>
                </div>
              </div>

              {isAdmin && batch.status === "completed" && batch.totalCost === null ? (
                <p className="rounded-[var(--radius-control)] bg-[var(--amber-soft)] px-3.5 py-2.5 text-sm text-[var(--amber-ink)]">
                  Sin costo: los insumos de este lote no tenían costo cargado.
                </p>
              ) : null}
              {isAdmin && batch.totalCost !== null ? (
                <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--moss-soft)] p-3.5 text-sm grid-cols-2">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--ink-2)]">Costo total</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--moss)]">
                      {formatCurrency(batch.totalCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--ink-2)]">Costo unitario</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--moss)]">
                      {formatCurrency(batch.unitCost ?? 0)}
                    </p>
                  </div>
                </div>
              ) : null}

              {batch.notes ? <p className="text-sm text-[var(--muted)]">{batch.notes}</p> : null}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={batch.isVoided || batch.inventoryPostedAt !== null}
                  onClick={() => setSelectedBatchId(batch.id)}
                >
                  Editar lote
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[var(--danger)]"
                  disabled={batch.isVoided || batch.status === "cancelled"}
                  onClick={() => setReverseBatchId(batch.id)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Anular lote
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
      {reverseBatch ? (
        <ReverseBatchModal
          batch={reverseBatch}
          onClose={() => setReverseBatchId(null)}
          onBatchReversed={(batch) => {
            setBatchRecords((current) => upsertBatch(current, batch));
          }}
        />
      ) : null}
    </div>
  );
}
