"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { applyStockAdjustmentAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import type { EntityType, InventoryMovementRecord, ProductRecord, SupplyRecord } from "@/lib/domain";
import { stockAdjustmentSchema } from "@/lib/validators";

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
      notes: "",
      movementDate: new Date().toISOString().slice(0, 10),
    },
  });

  useEffect(() => {
    form.reset({
      entityType,
      entityId,
      quantity: 0,
      notes: "",
      movementDate: new Date().toISOString().slice(0, 10),
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
                notes: "",
                movementDate: new Date().toISOString().slice(0, 10),
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
      <div className="rounded-2xl border border-[var(--line)] bg-[#f7f5ef] px-4 py-3 text-sm text-[var(--muted)]">
        Ajuste manual para <span className="font-semibold text-[var(--foreground)]">{entityLabel}</span>. Usa
        valores positivos para sumar stock y negativos para descontar.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Variacion" error={form.formState.errors.quantity?.message}>
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

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput {...field} value={toInputValue(field.value)} rows={4} placeholder="Motivo del ajuste." />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          Aplicar ajuste
        </Button>
      </div>
    </form>
  );
}
