"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { saveProductAction } from "@/actions/products";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import type { ProductCategoryRecord, ProductRecord } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { productFormSchema } from "@/lib/validators";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";

type ProductFormValues = z.input<typeof productFormSchema>;

type ProductFormProps = {
  product?: ProductRecord | null;
  categories: ProductCategoryRecord[];
  isAdmin: boolean;
  onSuccess: (product: ProductRecord) => void;
};

const ADMIN_ONLY_HINT = "Solo un administrador puede cambiarlo";

export function ProductForm({ product, categories, isAdmin, onSuccess }: ProductFormProps) {
  // Al editar, unidad, categoría y activo los cambia solo un admin (la base también lo exige).
  const lockMasterFields = Boolean(product) && !isAdmin;
  const activeCategories = categories.filter((category) => category.isActive);
  const defaultCategory = activeCategories[0]?.name ?? "";
  const currentCategory = product?.category ?? "";
  const hasInactiveCategory =
    currentCategory.length > 0 &&
    !activeCategories.some((category) => category.name === currentCategory);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      id: product?.id,
      name: product?.name ?? "",
      category: product?.category ?? defaultCategory,
      unit: product?.unit ?? "frasco",
      salePrice: product?.salePrice ?? 0,
      minStock: product?.minStock ?? 0,
      notes: product?.notes ?? "",
      isActive: product?.isActive ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      id: product?.id,
      name: product?.name ?? "",
      category: product?.category ?? defaultCategory,
      unit: product?.unit ?? "frasco",
      salePrice: product?.salePrice ?? 0,
      minStock: product?.minStock ?? 0,
      notes: product?.notes ?? "",
      isActive: product?.isActive ?? true,
    });
  }, [product, form, defaultCategory]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveProductAction(values);
            if (result.success && result.data) {
              setFeedback({ tone: "success", message: result.message });
              onSuccess(result.data);
              form.reset({
                name: "",
                category: defaultCategory,
                unit: "frasco",
                salePrice: 0,
                minStock: 0,
                notes: "",
                isActive: true,
              });
              return;
            }

            setFeedback({ tone: "error", message: result.error ?? result.message });
          });
        },
        (errors) => {
          setFeedback({ tone: "error", message: getFirstFormError(errors) });
        },
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} placeholder="Extracto Reishi" />
            )}
          />
        </Field>
        <Field
          label="Categoría"
          error={form.formState.errors.category?.message}
          hint={
            lockMasterFields
              ? ADMIN_ONLY_HINT
              : hasInactiveCategory
                ? "La categoría actual no está activa. Elegí una categoría activa para guardar."
                : undefined
          }
        >
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <SelectInput
                {...field}
                value={toInputValue(field.value)}
                disabled={lockMasterFields || activeCategories.length === 0}
              >
                {activeCategories.length === 0 ? (
                  <option value="">No hay categorías activas</option>
                ) : null}
                {hasInactiveCategory ? (
                  <option value={currentCategory} disabled>
                    {currentCategory} (inactiva)
                  </option>
                ) : null}
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Unidad"
          error={form.formState.errors.unit?.message}
          hint={lockMasterFields ? ADMIN_ONLY_HINT : undefined}
        >
          <Controller
            control={form.control}
            name="unit"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                placeholder="frasco"
                disabled={lockMasterFields}
              />
            )}
          />
        </Field>
        <Field label="Precio de venta" error={form.formState.errors.salePrice?.message}>
          <Controller
            control={form.control}
            name="salePrice"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
              />
            )}
          />
        </Field>
        <Field label="Stock mínimo" error={form.formState.errors.minStock?.message}>
          <Controller
            control={form.control}
            name="minStock"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
              />
            )}
          />
        </Field>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput
              {...field}
              value={toInputValue(field.value)}
              rows={4}
              placeholder="Formato, presentación o datos útiles."
            />
          )}
        />
      </Field>

      <label
        className={cn(
          "flex items-center gap-3 min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] px-3.5 py-3 text-[15px]",
          lockMasterFields ? "bg-[var(--surface-2)] text-[var(--muted)]" : "bg-[var(--surface)]",
        )}
      >
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <input
              name={field.name}
              ref={field.ref}
              type="checkbox"
              checked={Boolean(field.value)}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.checked)}
              disabled={lockMasterFields}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          )}
        />
        <span>
          Producto activo
          {lockMasterFields ? <span className="block text-[13px]">{ADMIN_ONLY_HINT}</span> : null}
        </span>
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-end gap-2">
        <Button type="submit" size="lg" busy={pending}>
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
