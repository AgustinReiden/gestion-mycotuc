"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { saveProductionBatchAction } from "@/actions/production";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import {
  getFirstFormError,
  toInputValue,
  toNullableNumberValue,
  toNumberValue,
} from "@/components/forms/value-helpers";
import { BATCH_STATUSES } from "@/lib/constants";
import type { ProductRecord, ProductionBatchRecord, SupplyRecord } from "@/lib/domain";
import { productionBatchFormSchema } from "@/lib/validators";
import { todayISO } from "@/lib/utils";

type ProductionBatchValues = z.input<typeof productionBatchFormSchema>;
type ProductionBatchSubmitValues = z.output<typeof productionBatchFormSchema>;

type ProductionBatchFormProps = {
  batch?: ProductionBatchRecord | null;
  products: ProductRecord[];
  supplies: SupplyRecord[];
  onSuccess: (batch: ProductionBatchRecord) => void;
};

type SelectableOption = {
  id: string;
  name: string;
  isFallback?: boolean;
};

function createDefaultInput(supplies: SupplyRecord[]) {
  return {
    supplyId: supplies[0]?.id ?? "",
    quantity: 1,
  };
}

function createDefaultOutput(products: ProductRecord[]) {
  return {
    productId: products[0]?.id ?? "",
    quantity: 1,
  };
}

function mergeSelectableOptions(
  primary: SelectableOption[],
  fallback: Array<SelectableOption | null | undefined>,
) {
  const registry = new Map<string, SelectableOption>();

  [...primary, ...fallback.filter(Boolean)].forEach((option) => {
    if (!option?.id || registry.has(option.id)) {
      return;
    }

    registry.set(option.id, option);
  });

  return Array.from(registry.values());
}

function getDefaultValues(
  batch: ProductionBatchRecord | null | undefined,
  products: ProductRecord[],
  supplies: SupplyRecord[],
): ProductionBatchValues {
  return {
    id: batch?.id,
    productId: batch?.productId ?? products[0]?.id ?? "",
    status: batch?.status ?? "draft",
    startedAt: batch?.startedAt ?? todayISO(),
    completedAt: batch?.completedAt ?? "",
    expectedQty: batch?.expectedQty ?? null,
    actualQty: batch?.actualQty ?? null,
    notes: batch?.notes ?? "",
    inputs:
      batch?.inputs.map((input) => ({ supplyId: input.supplyId, quantity: input.quantity })) ??
      (supplies.length > 0 ? [createDefaultInput(supplies)] : []),
    outputs:
      batch?.outputs.map((output) => ({ productId: output.productId, quantity: output.quantity })) ??
      (products.length > 0
        ? [
            {
              productId: batch?.productId ?? products[0]?.id ?? "",
              quantity: 1,
            },
          ]
        : []),
  };
}

export function ProductionBatchForm({ batch, products, supplies, onSuccess }: ProductionBatchFormProps) {
  "use no memo";

  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ProductionBatchValues, unknown, ProductionBatchSubmitValues>({
    resolver: zodResolver(productionBatchFormSchema),
    defaultValues: getDefaultValues(batch, products, supplies),
  });

  const inputs = useFieldArray({ control: form.control, name: "inputs" });
  const outputs = useFieldArray({ control: form.control, name: "outputs" });
  const watchedInputs = useWatch({ control: form.control, name: "inputs" }) ?? [];
  const watchedOutputs = useWatch({ control: form.control, name: "outputs" }) ?? [];
  const productOptions = mergeSelectableOptions(
    products.map((product) => ({ id: product.id, name: product.name })),
    [
      batch?.productId && batch?.productName && !products.some((product) => product.id === batch.productId)
        ? {
            id: batch.productId,
            name: `${batch.productName} (no activo)`,
            isFallback: true,
          }
        : null,
      ...(batch?.outputs ?? []).map((output) =>
        products.some((product) => product.id === output.productId)
          ? null
          : {
              id: output.productId,
              name: `${output.productName} (no activo)`,
              isFallback: true,
            },
      ),
    ],
  );
  const supplyOptions = mergeSelectableOptions(
    supplies.map((supply) => ({ id: supply.id, name: supply.name })),
    (batch?.inputs ?? []).map((input) =>
      supplies.some((supply) => supply.id === input.supplyId)
        ? null
        : {
            id: input.supplyId,
            name: `${input.supplyName} (no activo)`,
            isFallback: true,
          },
    ),
  );
  const hasActiveProducts = products.length > 0;
  const hasActiveSupplies = supplies.length > 0;
  const hasProductOptions = productOptions.length > 0;
  const hasSupplyOptions = supplyOptions.length > 0;
  const hasHistoricalReferences =
    productOptions.some((option) => option.isFallback) || supplyOptions.some((option) => option.isFallback);

  useEffect(() => {
    form.reset(getDefaultValues(batch, products, supplies));
  }, [batch, form, products, supplies]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          if (!hasProductOptions) {
            setFeedback({
              tone: "error",
              message: "No podemos guardar el lote todavía: falta al menos un producto disponible.",
            });
            return;
          }

          setFeedback(null);
          startTransition(async () => {
            const result = await saveProductionBatchAction(values);
            if (result.success && result.data) {
              setFeedback({ tone: "success", message: result.message });
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
      {!hasProductOptions ? (
        <ActionNotice
          tone="warning"
          message="Antes de registrar un lote, creá al menos un producto disponible."
        />
      ) : null}
      {hasHistoricalReferences ? (
        <ActionNotice
          tone="warning"
          message="Este lote incluye referencias históricas a productos o insumos no activos. Se mantendrán para evitar perder trazabilidad."
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto objetivo" error={form.formState.errors.productId?.message}>
          <Controller
            control={form.control}
            name="productId"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)} disabled={!hasProductOptions}>
                {!hasProductOptions ? <option value="">No hay productos disponibles</option> : null}
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>

        <Field label="Estado" error={form.formState.errors.status?.message}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)}>
                {BATCH_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Inicio" error={form.formState.errors.startedAt?.message}>
          <Controller
            control={form.control}
            name="startedAt"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} type="date" />
            )}
          />
        </Field>
        <Field label="Cierre" error={form.formState.errors.completedAt?.message}>
          <Controller
            control={form.control}
            name="completedAt"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} type="date" />
            )}
          />
        </Field>
        <Field label="Rendimiento esperado" error={form.formState.errors.expectedQty?.message}>
          <Controller
            control={form.control}
            name="expectedQty"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNullableNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
              />
            )}
          />
        </Field>
        <Field label="Rendimiento real" error={form.formState.errors.actualQty?.message}>
          <Controller
            control={form.control}
            name="actualQty"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNullableNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
              />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold">Consumos</h4>
              <p className="text-sm text-[var(--muted)]">Se descuentan al cerrar el lote.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasActiveSupplies}
              onClick={() => inputs.append(createDefaultInput(supplies))}
            >
              <Plus className="h-4 w-4" />
              Agregar insumo
            </Button>
          </div>
          {!hasActiveSupplies ? (
            <div className="mb-3">
              <ActionNotice
                tone="warning"
                message="No hay insumos activos disponibles. Podés crear el lote y cargar consumos cuando existan."
              />
            </div>
          ) : null}
          <div className="space-y-3">
            {inputs.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:grid-cols-[1.6fr_0.8fr_auto]">
                <Field label="Insumo" error={form.formState.errors.inputs?.[index]?.supplyId?.message}>
                  <Controller
                    control={form.control}
                    name={`inputs.${index}.supplyId`}
                    render={({ field: inputField }) => (
                      <SelectInput
                        {...inputField}
                        value={toInputValue(inputField.value)}
                        disabled={!hasSupplyOptions}
                      >
                        {!hasSupplyOptions ? <option value="">No hay insumos disponibles</option> : null}
                        {!supplyOptions.some((option) => option.id === watchedInputs[index]?.supplyId) &&
                        watchedInputs[index]?.supplyId ? (
                          <option value={watchedInputs[index]?.supplyId}>Insumo no disponible</option>
                        ) : null}
                        {supplyOptions.map((supply) => (
                          <option key={supply.id} value={supply.id}>
                            {supply.name}
                          </option>
                        ))}
                      </SelectInput>
                    )}
                  />
                </Field>
                <Field label="Cantidad" error={form.formState.errors.inputs?.[index]?.quantity?.message}>
                  <Controller
                    control={form.control}
                    name={`inputs.${index}.quantity`}
                    render={({ field: inputField }) => (
                      <TextInput
                        name={inputField.name}
                        ref={inputField.ref}
                        value={toInputValue(inputField.value)}
                        onBlur={inputField.onBlur}
                        onChange={(event) => inputField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                      />
                    )}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    aria-label={`Quitar insumo ${index + 1}`}
                    disabled={inputs.fields.length <= 1}
                    onClick={() => (inputs.fields.length > 1 ? inputs.remove(index) : null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold">Salidas</h4>
              <p className="text-sm text-[var(--muted)]">Se suman al stock cuando el lote se completa.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasActiveProducts}
              onClick={() => outputs.append(createDefaultOutput(products))}
            >
              <Plus className="h-4 w-4" />
              Agregar salida
            </Button>
          </div>
          <div className="space-y-3">
            {outputs.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:grid-cols-[1.6fr_0.8fr_auto]">
                <Field label="Producto" error={form.formState.errors.outputs?.[index]?.productId?.message}>
                  <Controller
                    control={form.control}
                    name={`outputs.${index}.productId`}
                    render={({ field: outputField }) => (
                      <SelectInput
                        {...outputField}
                        value={toInputValue(outputField.value)}
                        disabled={!hasProductOptions}
                      >
                        {!hasProductOptions ? <option value="">No hay productos disponibles</option> : null}
                        {!productOptions.some((option) => option.id === watchedOutputs[index]?.productId) &&
                        watchedOutputs[index]?.productId ? (
                          <option value={watchedOutputs[index]?.productId}>Producto no disponible</option>
                        ) : null}
                        {productOptions.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </SelectInput>
                    )}
                  />
                </Field>
                <Field label="Cantidad" error={form.formState.errors.outputs?.[index]?.quantity?.message}>
                  <Controller
                    control={form.control}
                    name={`outputs.${index}.quantity`}
                    render={({ field: outputField }) => (
                      <TextInput
                        name={outputField.name}
                        ref={outputField.ref}
                        value={toInputValue(outputField.value)}
                        onBlur={outputField.onBlur}
                        onChange={(event) => outputField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                      />
                    )}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    aria-label={`Quitar salida ${index + 1}`}
                    disabled={outputs.fields.length <= 1}
                    onClick={() => (outputs.fields.length > 1 ? outputs.remove(index) : null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
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
              placeholder="Observaciones del lote y control de calidad."
            />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-end gap-2">
        <Button type="submit" size="lg" busy={pending} disabled={!hasProductOptions}>
          {batch ? "Guardar lote" : "Crear lote"}
        </Button>
      </div>
    </form>
  );
}
