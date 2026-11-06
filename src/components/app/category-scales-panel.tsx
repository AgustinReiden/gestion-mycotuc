"use client";

import { useState, useTransition } from "react";
import { Edit3, Plus, Power, Tags } from "lucide-react";
import { setCategoryScaleStatusAction } from "@/actions/catalog";
import { ActionNotice } from "@/components/forms/action-notice";
import { CategoryScaleForm } from "@/components/forms/category-scale-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { CategoryScaleRecord, ProductCategoryRecord, ProductRecord } from "@/lib/domain";
import { formatQuantity } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

type CategoryScalesPanelProps = {
  scales: CategoryScaleRecord[];
  categories: ProductCategoryRecord[];
  products: ProductRecord[];
  isAdmin: boolean;
  onScaleSaved: (scale: CategoryScaleRecord) => void;
};

export function CategoryScalesPanel({ scales, categories, products, isAdmin, onScaleSaved }: CategoryScalesPanelProps) {
  const [editing, setEditing] = useState<CategoryScaleRecord | "new" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleScale(scale: CategoryScaleRecord) {
    setFeedback(null);
    setTogglingId(scale.id);
    startTransition(async () => {
      const result = await setCategoryScaleStatusAction({ id: scale.id, isActive: !scale.isActive });
      setTogglingId(null);

      if (result.success && result.data) {
        onScaleSaved(result.data);
        setFeedback({ tone: "success", message: result.message });
        return;
      }

      setFeedback({ tone: "error", message: result.error ?? result.message });
    });
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Escalas por categoría</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isAdmin
              ? "El precio depende de cuántas unidades de la categoría lleva el cliente, sin importar cuáles elija."
              : "Escalas vigentes por categoría. Solo un administrador puede modificarlas."}
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setEditing("new")}>
            <Plus className="h-5 w-5" />
            Nueva escala
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-4">
          <ActionNotice tone={feedback.tone} message={feedback.message} />
        </div>
      ) : null}

      {scales.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Todavía no hay escalas"
            description={
              isAdmin
                ? "Creá una escala para vender, por ejemplo, 3 extractos a elección a un precio fijo."
                : "Cuando un administrador cree escalas, vas a verlas acá."
            }
            icon={Tags}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scales.map((scale) => (
            <article
              key={scale.id}
              className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{scale.categoryName}</h3>
                {scale.isActive && scale.categoryIsActive ? (
                  <Badge tone="success">Activa</Badge>
                ) : (
                  <Badge>{scale.categoryIsActive ? "Inactiva" : "Categoría inactiva"}</Badge>
                )}
              </div>
              <ul className="space-y-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm">
                {scale.tiers.map((tier) => (
                  <li key={tier.id}>
                    Desde {formatQuantity(tier.minQty)} → {formatCurrency(tier.price)}{" "}
                    {tier.mode === "pack" ? "en total" : "por unidad"}
                  </li>
                ))}
              </ul>
              {scale.excludedProductIds.length > 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  {scale.excludedProductIds.length === 1
                    ? "1 producto excluido"
                    : `${scale.excludedProductIds.length} productos excluidos`}
                </p>
              ) : null}
              {isAdmin ? (
                <div className="mt-auto flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditing(scale)}>
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    busy={pending && togglingId === scale.id}
                    disabled={pending}
                    onClick={() => toggleScale(scale)}
                  >
                    <Power className="h-4 w-4" />
                    {scale.isActive ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {isAdmin && editing ? (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing === "new" ? "Nueva escala" : "Editar escala"}
          description="Definí la categoría, los productos que entran y los escalones de precio."
        >
          <CategoryScaleForm
            scale={editing === "new" ? null : editing}
            categories={categories}
            takenCategoryIds={scales.map((scale) => scale.categoryId)}
            products={products}
            onSuccess={(scale) => {
              onScaleSaved(scale);
              setFeedback({ tone: "success", message: "Escala guardada." });
              setEditing(null);
            }}
          />
        </Modal>
      ) : null}
    </Panel>
  );
}
