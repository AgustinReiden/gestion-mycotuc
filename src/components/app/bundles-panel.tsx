"use client";

import { useState, useTransition } from "react";
import { Boxes, Edit3, Plus, Power } from "lucide-react";
import { setBundleStatusAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { BundleForm } from "@/components/forms/bundle-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { BundleRecord, ProductRecord } from "@/lib/domain";
import { formatQuantity } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";

type BundlesPanelProps = {
  bundles: BundleRecord[];
  products: ProductRecord[];
  isAdmin: boolean;
  onBundleSaved: (bundle: BundleRecord) => void;
};

export function BundlesPanel({ bundles, products, isAdmin, onBundleSaved }: BundlesPanelProps) {
  const [editing, setEditing] = useState<BundleRecord | "new" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleBundle(bundle: BundleRecord) {
    setFeedback(null);
    setTogglingId(bundle.id);
    startTransition(async () => {
      const result = await setBundleStatusAction({ id: bundle.id, isActive: !bundle.isActive });
      setTogglingId(null);

      if (result.success && result.data) {
        onBundleSaved(result.data);
        setFeedback({ tone: "success", message: result.message });
        return;
      }

      setFeedback({ tone: "error", message: result.error ?? result.message });
    });
  }

  return (
    <Panel>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Combos</p>
          <h2 className="mt-2 text-2xl font-semibold">Combos de productos</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isAdmin
              ? "Arma combos con precio propio. Al venderlos se descuenta el stock de cada componente."
              : "Combos disponibles y sus componentes. Solo un administrador puede modificarlos."}
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" className="w-full sm:w-auto" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Nuevo combo
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <div className="mt-4">
          <ActionNotice tone={feedback.tone} message={feedback.message} />
        </div>
      ) : null}

      {bundles.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Todavia no hay combos"
            description={
              isAdmin
                ? "Crea un combo para vender varios productos con un precio fijo."
                : "Cuando un administrador cree combos, vas a verlos aca."
            }
            icon={Boxes}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bundles.map((bundle) => (
            <article
              key={bundle.id}
              className="flex flex-col gap-3 rounded-[24px] border border-[var(--line)] bg-white/80 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{bundle.name}</h3>
                  <p className="text-xl font-semibold text-[#15553e]">{formatCurrency(bundle.salePrice)}</p>
                </div>
                {bundle.isActive ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
              </div>
              <ul className="space-y-1 rounded-[20px] border border-[var(--line)] bg-[#f7f5ef] p-3 text-sm">
                {bundle.items.map((item) => (
                  <li key={item.id}>
                    {item.productName} x {formatQuantity(item.quantity)}
                  </li>
                ))}
              </ul>
              {bundle.notes ? <p className="text-sm text-[var(--muted)]">{bundle.notes}</p> : null}
              {isAdmin ? (
                <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setEditing(bundle)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    busy={pending && togglingId === bundle.id}
                    disabled={pending}
                    onClick={() => toggleBundle(bundle)}
                  >
                    <Power className="h-4 w-4" />
                    {bundle.isActive ? "Desactivar" : "Activar"}
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
          title={editing === "new" ? "Nuevo combo" : "Editar combo"}
          description="Define nombre, precio y productos que componen el combo."
        >
          <BundleForm
            bundle={editing === "new" ? null : editing}
            products={products}
            onSuccess={(bundle) => {
              onBundleSaved(bundle);
              setFeedback({ tone: "success", message: "Combo guardado." });
              setEditing(null);
            }}
          />
        </Modal>
      ) : null}
    </Panel>
  );
}
