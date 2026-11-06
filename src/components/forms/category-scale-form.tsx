"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { saveCategoryScaleAction } from "@/actions/catalog";
import { ActionNotice } from "@/components/forms/action-notice";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/fields";
import type { CategoryScaleRecord, ProductCategoryRecord, ProductRecord } from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";
import { categoryScaleFormSchema } from "@/lib/validators";

type CategoryScaleFormValues = z.input<typeof categoryScaleFormSchema>;
type CategoryScaleFormOutput = z.output<typeof categoryScaleFormSchema>;

type CategoryScaleFormProps = {
  scale: CategoryScaleRecord | null;
  categories: ProductCategoryRecord[];
  /** Categorias que ya tienen escala (una por categoria): no se ofrecen al crear una nueva. */
  takenCategoryIds: string[];
  products: ProductRecord[];
  onSuccess: (scale: CategoryScaleRecord) => void;
};

export function CategoryScaleForm({
  scale,
  categories,
  takenCategoryIds,
  products,
  onSuccess,
}: CategoryScaleFormProps) {
  "use no memo";

  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const categoryOptions = categories.filter(
    (category) => category.id === scale?.categoryId || (category.isActive && !takenCategoryIds.includes(category.id)),
  );
  const form = useForm<CategoryScaleFormValues, unknown, CategoryScaleFormOutput>({
    resolver: zodResolver(categoryScaleFormSchema),
    defaultValues: {
      id: scale?.id,
      categoryId: scale?.categoryId ?? categoryOptions[0]?.id ?? "",
      isActive: scale?.isActive ?? true,
      excludedProductIds: scale?.excludedProductIds ?? [],
      tiers: scale?.tiers.length
        ? scale.tiers.map((tier) => ({ minQty: tier.minQty, price: tier.price, mode: tier.mode }))
        : [{ minQty: 3, price: "", mode: "pack" }],
    },
  });
  const tiers = useFieldArray({ control: form.control, name: "tiers" });
  const watchedTiers = useWatch({ control: form.control, name: "tiers" }) ?? [];
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const excluded = useWatch({ control: form.control, name: "excludedProductIds" }) ?? [];
  const categoryName = categories.find((category) => category.id === categoryId)?.name;
  const categoryProducts = products.filter((product) => product.isActive && product.category === categoryName);
  const maxListPrice = categoryProducts
    .filter((product) => !excluded.includes(product.id))
    .reduce((max, product) => Math.max(max, product.salePrice), 0);

  function toggleProduct(productId: string, included: boolean) {
    const next = included ? excluded.filter((entry) => entry !== productId) : [...excluded, productId];
    form.setValue("excludedProductIds", next, { shouldDirty: true });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveCategoryScaleAction({
              ...values,
              excludedProductIds: values.excludedProductIds.filter((id) =>
                categoryProducts.some((product) => product.id === id),
              ),
            });
            if (result.success && result.data) {
              onSuccess(result.data);
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
      <Field label="Categoría" error={form.formState.errors.categoryId?.message}>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <SelectInput
              {...field}
              value={toInputValue(field.value)}
              disabled={Boolean(scale)}
              onChange={(event) => {
                field.onChange(event.target.value);
                form.setValue("excludedProductIds", [], { shouldDirty: true });
              }}
            >
              {categoryOptions.length === 0 ? <option value="">No quedan categorías sin escala</option> : null}
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {!category.isActive ? " (inactiva)" : ""}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold">Escalones</h4>
            <p className="text-sm text-[var(--muted)]">
              Desde cuántas unidades de la categoría rige cada precio. Si el escalón es &quot;total del pack&quot;, se
              cobra ese total por esas unidades y las que sobran van a su precio normal.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const last = Math.max(0, ...watchedTiers.map((tier) => Number(tier?.minQty) || 0));
              tiers.append({ minQty: last + 1, price: "", mode: "unit" });
            }}
          >
            <Plus className="h-4 w-4" />
            Agregar escalón
          </Button>
        </div>

        <div className="space-y-3">
          {tiers.fields.map((field, index) => {
            const tierErrors = form.formState.errors.tiers?.[index];
            const mode = watchedTiers[index]?.mode;
            const price = Number(watchedTiers[index]?.price) || 0;

            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:grid-cols-[0.7fr_1fr_1.2fr_auto]"
              >
                <Field label="Desde (unidades)" error={tierErrors?.minQty?.message}>
                  <Controller
                    control={form.control}
                    name={`tiers.${index}.minQty`}
                    render={({ field: tierField }) => (
                      <TextInput
                        name={tierField.name}
                        ref={tierField.ref}
                        value={toInputValue(tierField.value)}
                        onBlur={tierField.onBlur}
                        onChange={(event) => tierField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="1"
                      />
                    )}
                  />
                </Field>
                <Field
                  label="Precio"
                  error={tierErrors?.price?.message}
                  hint={
                    mode === "unit" && maxListPrice > 0 && price > maxListPrice
                      ? `Es más que el precio normal (${formatCurrency(maxListPrice)}).`
                      : undefined
                  }
                >
                  <Controller
                    control={form.control}
                    name={`tiers.${index}.price`}
                    render={({ field: tierField }) => (
                      <TextInput
                        name={tierField.name}
                        ref={tierField.ref}
                        value={toInputValue(tierField.value)}
                        onBlur={tierField.onBlur}
                        onChange={(event) => tierField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                      />
                    )}
                  />
                </Field>
                <Field label="El precio es" error={tierErrors?.mode?.message}>
                  <Controller
                    control={form.control}
                    name={`tiers.${index}.mode`}
                    render={({ field: tierField }) => (
                      <SelectInput {...tierField} value={toInputValue(tierField.value)}>
                        <option value="pack">Total del pack</option>
                        <option value="unit">Por unidad</option>
                      </SelectInput>
                    )}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    aria-label={`Quitar escalón ${index + 1}`}
                    disabled={tiers.fields.length <= 1}
                    onClick={() => (tiers.fields.length > 1 ? tiers.remove(index) : null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {form.formState.errors.tiers?.message ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{form.formState.errors.tiers.message}</p>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
        <h4 className="text-lg font-semibold">Productos que entran</h4>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Destildá los productos que no participan de la promo: no suman a la cantidad y se cobran a su precio normal.
        </p>
        {categoryProducts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Esta categoría todavía no tiene productos activos.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {categoryProducts.map((product) => {
              const included = !excluded.includes(product.id);

              return (
                <li key={product.id}>
                  <label className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-[15px]">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={(event) => toggleProduct(product.id, event.target.checked)}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                    <span className="flex-1">{product.name}</span>
                    <span className="text-sm text-[var(--muted)] tabular-nums">{formatCurrency(product.salePrice)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[15px]">
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
              className="h-5 w-5 accent-[var(--accent)]"
            />
          )}
        />
        Escala activa
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-end gap-2">
        <Button type="submit" size="lg" busy={pending} disabled={categoryOptions.length === 0}>
          {scale ? "Guardar cambios" : "Crear escala"}
        </Button>
      </div>
    </form>
  );
}
