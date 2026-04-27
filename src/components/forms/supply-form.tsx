"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { saveSupplyAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import type { SupplyRecord } from "@/lib/domain";
import { supplyFormSchema } from "@/lib/validators";

type SupplyFormValues = z.input<typeof supplyFormSchema>;

type SupplyFormProps = {
  supply?: SupplyRecord | null;
  onSuccess: (supply: SupplyRecord) => void;
};

export function SupplyForm({ supply, onSuccess }: SupplyFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<SupplyFormValues>({
    resolver: zodResolver(supplyFormSchema),
    defaultValues: {
      id: supply?.id,
      name: supply?.name ?? "",
      unit: supply?.unit ?? "kg",
      minStock: supply?.minStock ?? 0,
      notes: supply?.notes ?? "",
      isActive: supply?.isActive ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      id: supply?.id,
      name: supply?.name ?? "",
      unit: supply?.unit ?? "kg",
      minStock: supply?.minStock ?? 0,
      notes: supply?.notes ?? "",
      isActive: supply?.isActive ?? true,
    });
  }, [supply, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveSupplyAction(values);
            if (result.success && result.data) {
              onSuccess(result.data);
              form.reset({
                name: "",
                unit: "kg",
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
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} placeholder="Aserrin" />
            )}
          />
        </Field>
        <Field label="Unidad" error={form.formState.errors.unit?.message}>
          <Controller
            control={form.control}
            name="unit"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} placeholder="kg" />
            )}
          />
        </Field>
      </div>

      <Field label="Stock minimo" error={form.formState.errors.minStock?.message}>
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
              min="0"
              step="0.01"
            />
          )}
        />
      </Field>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput
              {...field}
              value={toInputValue(field.value)}
              rows={4}
              placeholder="Proveedor sugerido o calidad esperada."
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
        Insumo activo
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          {supply ? "Guardar cambios" : "Crear insumo"}
        </Button>
      </div>
    </form>
  );
}
