"use client";

import { useState, useTransition } from "react";
import { Edit3, Plus, Power } from "lucide-react";
import { saveProductCategoryAction } from "@/actions/catalog";
import { ActionNotice } from "@/components/forms/action-notice";
import { ProductCategoryForm } from "@/components/forms/product-category-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { ProductCategoryRecord, ProductRecord } from "@/lib/domain";

type ProductCategoriesModalProps = {
  categories: ProductCategoryRecord[];
  products: ProductRecord[];
  isAdmin: boolean;
  onClose: () => void;
  onCategorySaved: (category: ProductCategoryRecord) => void;
};

export function ProductCategoriesModal({
  categories,
  products,
  isAdmin,
  onClose,
  onCategorySaved,
}: ProductCategoriesModalProps) {
  const [editing, setEditing] = useState<ProductCategoryRecord | "new" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleCategory(category: ProductCategoryRecord) {
    setFeedback(null);
    setTogglingId(category.id);
    startTransition(async () => {
      const result = await saveProductCategoryAction({
        id: category.id,
        name: category.name,
        isActive: !category.isActive,
      });
      setTogglingId(null);

      if (result.success && result.data) {
        onCategorySaved(result.data);
        setFeedback({ tone: "success", message: result.data.isActive ? "Categoría activada." : "Categoría desactivada." });
        return;
      }

      setFeedback({ tone: "error", message: result.error ?? result.message });
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Categorías"
      description={
        isAdmin
          ? "Creá, renombrá o desactivá las categorías de producto."
          : "Categorías de producto. Solo un administrador puede modificarlas."
      }
    >
      <div className="space-y-4">
        {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

        <ul className="divide-y divide-[var(--line)] rounded-[14px] border border-[var(--line)]">
          {categories.map((category) => {
            const productCount = products.filter((product) => product.category === category.name).length;

            return (
              <li key={category.id} className="grid gap-2 p-3">
                {editing !== "new" && editing?.id === category.id ? (
                  <ProductCategoryForm
                    category={category}
                    onCancel={() => setEditing(null)}
                    onSuccess={(saved) => {
                      onCategorySaved(saved);
                      setFeedback({ tone: "success", message: "Categoría guardada." });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">{category.name}</p>
                      <p className="text-[13px] text-[var(--muted)]">
                        {productCount === 1 ? "1 producto" : `${productCount} productos`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {category.isActive ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}
                      {isAdmin ? (
                        <>
                          <Button type="button" variant="secondary" onClick={() => setEditing(category)}>
                            <Edit3 className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            busy={pending && togglingId === category.id}
                            disabled={pending}
                            onClick={() => toggleCategory(category)}
                          >
                            <Power className="h-4 w-4" />
                            {category.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {isAdmin ? (
          editing === "new" ? (
            <ProductCategoryForm
              category={null}
              onCancel={() => setEditing(null)}
              onSuccess={(saved) => {
                onCategorySaved(saved);
                setFeedback({ tone: "success", message: "Categoría creada." });
                setEditing(null);
              }}
            />
          ) : (
            <Button type="button" size="lg" className="w-full" onClick={() => setEditing("new")}>
              <Plus className="h-5 w-5" />
              Nueva categoría
            </Button>
          )
        ) : null}
      </div>
    </Modal>
  );
}
