"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createExpenseAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import type { ExpenseRecord, LookupOption } from "@/lib/domain";
import { expenseFormSchema } from "@/lib/validators";

type ExpenseFormValues = z.input<typeof expenseFormSchema>;

type ExpenseFormProps = {
  categories: LookupOption[];
  onSuccess: (expense: ExpenseRecord) => void;
};

function getDefaultValues(categories: LookupOption[]): ExpenseFormValues {
  return {
    concept: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryId: categories[0]?.id ?? "",
    amount: 0,
    notes: "",
  };
}

export function ExpenseForm({ categories, onSuccess }: ExpenseFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const hasCategories = categories.length > 0;
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: getDefaultValues(categories),
  });

  const selectedCategoryId = useWatch({
    control: form.control,
    name: "categoryId",
  });

  useEffect(() => {
    const hasSelectedCategory = categories.some((category) => category.id === selectedCategoryId);

    if (selectedCategoryId && hasSelectedCategory) {
      return;
    }

    form.reset({
      ...form.getValues(),
      categoryId: categories[0]?.id ?? "",
    });
  }, [categories, form, selectedCategoryId]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        if (!hasCategories) {
          setFeedback({
            tone: "error",
            message: "No podemos registrar el gasto todavia: falta al menos una categoria activa.",
          });
          return;
        }

        setFeedback(null);
        startTransition(async () => {
          const result = await createExpenseAction(values);
          if (result.success && result.data) {
            onSuccess(result.data);
            form.reset(getDefaultValues(categories));
            return;
          }

          setFeedback({ tone: "error", message: result.error ?? result.message });
        });
      })}
    >
      {!hasCategories ? (
        <ActionNotice
          tone="warning"
          message="Antes de registrar un gasto manual, crea al menos una categoria activa."
        />
      ) : null}

      <Field label="Concepto" error={form.formState.errors.concept?.message}>
        <TextInput {...form.register("concept")} placeholder="Factura de luz" />
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Monto" error={form.formState.errors.amount?.message}>
          <TextInput {...form.register("amount", { valueAsNumber: true })} type="number" min="0" step="0.01" />
        </Field>
        <Field label="Categoria" error={form.formState.errors.categoryId?.message}>
          <SelectInput {...form.register("categoryId")} disabled={!hasCategories}>
            {!hasCategories ? <option value="">No hay categorias activas disponibles</option> : null}
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Fecha" error={form.formState.errors.expenseDate?.message}>
          <TextInput {...form.register("expenseDate")} type="date" />
        </Field>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <TextareaInput {...form.register("notes")} rows={4} placeholder="Detalle adicional del gasto." />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending} disabled={!hasCategories}>
          Registrar gasto
        </Button>
      </div>
    </form>
  );
}
