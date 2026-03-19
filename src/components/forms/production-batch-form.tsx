"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { saveProductionBatchAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { BATCH_STATUSES } from "@/lib/constants";
import type { ProductRecord, ProductionBatchRecord, SupplyRecord } from "@/lib/domain";
import { productionBatchFormSchema } from "@/lib/validators";

type ProductionBatchValues = z.input<typeof productionBatchFormSchema>;

type ProductionBatchFormProps = {
  batch?: ProductionBatchRecord | null;
  products: ProductRecord[];
  supplies: SupplyRecord[];
  onSuccess: () => void;
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

export function ProductionBatchForm({ batch, products, supplies, onSuccess }: ProductionBatchFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ProductionBatchValues>({
    resolver: zodResolver(productionBatchFormSchema),
    defaultValues: {
      id: batch?.id,
      productId: batch?.productId ?? products[0]?.id ?? "",
      status: batch?.status ?? "draft",
      startedAt: batch?.startedAt ?? new Date().toISOString().slice(0, 10),
      completedAt: batch?.completedAt ?? "",
      expectedQty: batch?.expectedQty ?? null,
      actualQty: batch?.actualQty ?? null,
      notes: batch?.notes ?? "",
      inputs: batch?.inputs.map((input) => ({ supplyId: input.supplyId, quantity: input.quantity })) ?? [
        createDefaultInput(supplies),
      ],
      outputs: batch?.outputs.map((output) => ({ productId: output.productId, quantity: output.quantity })) ?? [
        {
          productId: batch?.productId ?? products[0]?.id ?? "",
          quantity: 1,
        },
      ],
    },
  });

  const inputs = useFieldArray({ control: form.control, name: "inputs" });
  const outputs = useFieldArray({ control: form.control, name: "outputs" });

  useEffect(() => {
    form.reset({
      id: batch?.id,
      productId: batch?.productId ?? products[0]?.id ?? "",
      status: batch?.status ?? "draft",
      startedAt: batch?.startedAt ?? new Date().toISOString().slice(0, 10),
      completedAt: batch?.completedAt ?? "",
      expectedQty: batch?.expectedQty ?? null,
      actualQty: batch?.actualQty ?? null,
      notes: batch?.notes ?? "",
      inputs: batch?.inputs.map((input) => ({ supplyId: input.supplyId, quantity: input.quantity })) ?? [
        createDefaultInput(supplies),
      ],
      outputs: batch?.outputs.map((output) => ({ productId: output.productId, quantity: output.quantity })) ?? [
        {
          productId: batch?.productId ?? products[0]?.id ?? "",
          quantity: 1,
        },
      ],
    });
  }, [batch, form, products, supplies]);

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        startTransition(async () => {
          const result = await saveProductionBatchAction(values);
          if (result.success) {
            setFeedback({ tone: "success", message: result.message });
            onSuccess();
            return;
          }

          setFeedback({ tone: "error", message: result.error ?? result.message });
        });
      })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Producto objetivo" error={form.formState.errors.productId?.message}>
          <SelectInput {...form.register("productId")}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label="Estado" error={form.formState.errors.status?.message}>
          <SelectInput {...form.register("status")}>
            {BATCH_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Inicio" error={form.formState.errors.startedAt?.message}>
          <TextInput {...form.register("startedAt")} type="date" />
        </Field>
        <Field label="Cierre" error={form.formState.errors.completedAt?.message}>
          <TextInput {...form.register("completedAt")} type="date" />
        </Field>
        <Field label="Rendimiento esperado" error={form.formState.errors.expectedQty?.message}>
          <TextInput
            {...form.register("expectedQty", {
              setValueAs: (value) => (value === "" ? null : Number(value)),
            })}
            type="number"
            step="0.01"
          />
        </Field>
        <Field label="Rendimiento real" error={form.formState.errors.actualQty?.message}>
          <TextInput
            {...form.register("actualQty", {
              setValueAs: (value) => (value === "" ? null : Number(value)),
            })}
            type="number"
            step="0.01"
          />
        </Field>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[26px] border border-[var(--line)] bg-[#f7f5ef] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold">Consumos</h4>
              <p className="text-sm text-[var(--muted)]">Se descuentan al cerrar el lote.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => inputs.append(createDefaultInput(supplies))}>
              <Plus className="h-4 w-4" />
              Agregar insumo
            </Button>
          </div>
          <div className="space-y-3">
            {inputs.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.8fr_auto]">
                <Field label="Insumo" error={form.formState.errors.inputs?.[index]?.supplyId?.message}>
                  <SelectInput {...form.register(`inputs.${index}.supplyId`)}>
                    {supplies.map((supply) => (
                      <option key={supply.id} value={supply.id}>
                        {supply.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Cantidad" error={form.formState.errors.inputs?.[index]?.quantity?.message}>
                  <TextInput
                    {...form.register(`inputs.${index}.quantity`, { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="ghost" onClick={() => (inputs.fields.length > 1 ? inputs.remove(index) : null)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[26px] border border-[var(--line)] bg-[#f7f5ef] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-semibold">Salidas</h4>
              <p className="text-sm text-[var(--muted)]">Se suman al stock cuando el lote se completa.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => outputs.append(createDefaultOutput(products))}>
              <Plus className="h-4 w-4" />
              Agregar salida
            </Button>
          </div>
          <div className="space-y-3">
            {outputs.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.8fr_auto]">
                <Field label="Producto" error={form.formState.errors.outputs?.[index]?.productId?.message}>
                  <SelectInput {...form.register(`outputs.${index}.productId`)}>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Cantidad" error={form.formState.errors.outputs?.[index]?.quantity?.message}>
                  <TextInput
                    {...form.register(`outputs.${index}.quantity`, { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="ghost" onClick={() => (outputs.fields.length > 1 ? outputs.remove(index) : null)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <TextareaInput {...form.register("notes")} rows={4} placeholder="Observaciones del lote y control de calidad." />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          {batch ? "Guardar lote" : "Crear lote"}
        </Button>
      </div>
    </form>
  );
}
