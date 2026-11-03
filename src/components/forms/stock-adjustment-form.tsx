"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { applyStockAdjustmentAction } from "@/actions/inventory";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import type { EntityType, InventoryMovementRecord, ProductRecord, SupplyRecord } from "@/lib/domain";
import { stockAdjustmentSchema } from "@/lib/validators";
import { todayISO } from "@/lib/utils";

type AdjustmentValues = z.input<typeof stockAdjustmentSchema>;

type StockAdjustmentFormProps = {
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  onSuccess: (result: {
    movement: InventoryMovementRecord;
    product: ProductRecord | null;
    supply: SupplyRecord | null;
  }) => void;
};

export function StockAdjustmentForm({
  entityType,
  entityId,
  entityLabel,
  onSuccess,
}: StockAdjustmentFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      entityType,
      entityId,
      quantity: 0,
      unitCost: "",
      notes: "",
      movementDate: todayISO(),
    },
  });

  // El costo unitario solo aplica a ajustes positivos (stock inicial o encontrado).
  const quantity = Number(useWatch({ control: form.control, name: "quantity" }));
  const isPositive = Number.isFinite(quantity) && quantity > 0;

  useEffect(() => {
    form.reset({
      entityType,
      entityId,
      quantity: 0,
      unitCost: "",
      notes: "",
      movementDate: todayISO(),
    });
  }, [entityId, entityType, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await applyStockAdjustmentAction(values);
            if (result.success && result.data) {
              onSuccess(result.data);
              form.reset({
                entityType,
                entityId,
                quantity: 0,
                unitCost: "",
                notes: "",
                movementDate: todayISO(),
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
      <div className="rounded-[var(--radius-control)] bg-[var(--surface-2)] px-3.5 py-3 text-[15px] text-[var(--ink-2)]">
        Ajuste de <span className="font-semibold text-[var(--foreground)]">{entityLabel}</span>. Un número
        positivo suma stock (por ejemplo, el stock inicial) y uno negativo lo descuenta (merma, rotura).
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Variación" error={form.formState.errors.quantity?.message}>
          <Controller
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                step="0.01"
              />
            )}
          />
        </Field>
        <Field label="Fecha" error={form.formState.errors.movementDate?.message}>
          <Controller
            control={form.control}
            name="movementDate"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} type="date" />
            )}
          />
        </Field>
      </div>

      {isPositive ? (
        <Field
          label="Costo unitario"
          error={form.formState.errors.unitCost?.message}
          hint="Cargalo en el stock inicial: sin costo, las ventas de este stock no tienen margen."
        >
          <Controller
            control={form.control}
            name="unitCost"
            // Si la variacion deja de ser positiva el campo se oculta y su valor se descarta.
            shouldUnregister
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="$ por unidad"
              />
            )}
          />
        </Field>
      ) : null}

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput {...field} value={toInputValue(field.value)} rows={3} placeholder="Motivo: stock inicial, conteo, merma…" />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex justify-end">
        <Button type="submit" size="lg" busy={pending} className="w-full sm:w-auto">
          Aplicar ajuste
        </Button>
      </div>
    </form>
  );
}
