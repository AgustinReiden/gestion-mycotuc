"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { saveBundleAction } from "@/actions/catalog";
import { ActionNotice } from "@/components/forms/action-notice";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import type { BundleRecord, ProductRecord } from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";
import { bundleFormSchema } from "@/lib/validators";

type BundleFormValues = z.input<typeof bundleFormSchema>;
type BundleFormOutput = z.output<typeof bundleFormSchema>;

type BundleFormProps = {
  bundle: BundleRecord | null;
  products: ProductRecord[];
  onSuccess: (bundle: BundleRecord) => void;
};

export function BundleForm({ bundle, products, onSuccess }: BundleFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const bundleProductIds = new Set(bundle?.items.map((item) => item.productId) ?? []);
  const productOptions = products.filter(
    (product) => product.isActive || bundleProductIds.has(product.id),
  );
  const form = useForm<BundleFormValues, unknown, BundleFormOutput>({
    resolver: zodResolver(bundleFormSchema),
    defaultValues: {
      id: bundle?.id,
      name: bundle?.name ?? "",
      salePrice: bundle?.salePrice ?? "",
      notes: bundle?.notes ?? "",
      isActive: bundle?.isActive ?? true,
      items: bundle?.items.length
        ? bundle.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
        : [{ productId: productOptions[0]?.id ?? "", quantity: 1 }],
    },
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = useWatch({ control: form.control, name: "items" }) ?? [];
  const componentsValue = watchedItems.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item?.productId);
    return sum + (product?.salePrice ?? 0) * (Number(item?.quantity) || 0);
  }, 0);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveBundleAction(values);
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
      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} placeholder="Combo Inmunidad" />
            )}
          />
        </Field>
        <Field
          label="Precio del combo"
          error={form.formState.errors.salePrice?.message}
          hint={`Componentes a precio base: ${formatCurrency(componentsValue)}`}
        >
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
                min="0.01"
                step="0.01"
              />
            )}
          />
        </Field>
      </div>

      <div className="rounded-[26px] border border-[var(--line)] bg-[#f7f5ef] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold">Componentes</h4>
            <p className="text-sm text-[var(--muted)]">
              Cada combo vendido descuenta estas cantidades del stock de cada producto.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={productOptions.length === 0}
            onClick={() => {
              const used = new Set(watchedItems.map((item) => item?.productId));
              const next = productOptions.find((product) => !used.has(product.id)) ?? productOptions[0];
              items.append({ productId: next?.id ?? "", quantity: 1 });
            }}
          >
            <Plus className="h-4 w-4" />
            Agregar producto
          </Button>
        </div>

        <div className="space-y-3">
          {items.fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.7fr_auto]"
            >
              <Field label="Producto" error={form.formState.errors.items?.[index]?.productId?.message}>
                <Controller
                  control={form.control}
                  name={`items.${index}.productId`}
                  render={({ field: itemField }) => (
                    <SelectInput {...itemField} value={toInputValue(itemField.value)}>
                      {productOptions.length === 0 ? (
                        <option value="">No hay productos activos disponibles</option>
                      ) : null}
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {!product.isActive ? " (inactivo)" : ""}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                />
              </Field>
              <Field label="Cantidad" error={form.formState.errors.items?.[index]?.quantity?.message}>
                <Controller
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field: itemField }) => (
                    <TextInput
                      name={itemField.name}
                      ref={itemField.ref}
                      value={toInputValue(itemField.value)}
                      onBlur={itemField.onBlur}
                      onChange={(event) => itemField.onChange(toNumberValue(event.target.value))}
                      type="number"
                      min="1"
                      step="1"
                    />
                  )}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Quitar producto ${index + 1}`}
                  disabled={items.fields.length <= 1}
                  onClick={() => (items.fields.length > 1 ? items.remove(index) : null)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {form.formState.errors.items?.message ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{form.formState.errors.items.message}</p>
        ) : null}
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput
              {...field}
              value={toInputValue(field.value)}
              rows={3}
              placeholder="Presentacion, promocion o condiciones del combo."
            />
          )}
        />
      </Field>

      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
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
              className="h-4 w-4 accent-[var(--accent)]"
            />
          )}
        />
        Combo activo
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          {bundle ? "Guardar cambios" : "Crear combo"}
        </Button>
      </div>
    </form>
  );
}
