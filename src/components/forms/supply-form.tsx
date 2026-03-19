"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { saveSupplyAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import type { SupplyRecord } from "@/lib/domain";
import { supplyFormSchema } from "@/lib/validators";

type SupplyFormValues = z.input<typeof supplyFormSchema>;

type SupplyFormProps = {
  supply?: SupplyRecord | null;
  onSuccess: () => void;
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
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        startTransition(async () => {
          const result = await saveSupplyAction(values);
          if (result.success) {
            setFeedback({ tone: "success", message: result.message });
            onSuccess();
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
      })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <TextInput {...form.register("name")} placeholder="Aserrin" />
        </Field>
        <Field label="Unidad" error={form.formState.errors.unit?.message}>
          <TextInput {...form.register("unit")} placeholder="kg" />
        </Field>
      </div>

      <Field label="Stock minimo" error={form.formState.errors.minStock?.message}>
        <TextInput {...form.register("minStock", { valueAsNumber: true })} type="number" min="0" step="0.01" />
      </Field>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <TextareaInput {...form.register("notes")} rows={4} placeholder="Proveedor sugerido o calidad esperada." />
      </Field>

      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...form.register("isActive")} />
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
