"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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

export function ExpenseForm({ categories, onSuccess }: ExpenseFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      concept: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      categoryId: categories[0]?.id ?? "",
      amount: 0,
      notes: "",
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        startTransition(async () => {
          const result = await createExpenseAction(values);
          if (result.success && result.data) {
            onSuccess(result.data);
            form.reset({
              concept: "",
              expenseDate: new Date().toISOString().slice(0, 10),
              categoryId: categories[0]?.id ?? "",
              amount: 0,
              notes: "",
            });
            return;
          }

          setFeedback({ tone: "error", message: result.error ?? result.message });
        });
      })}
    >
      <Field label="Concepto" error={form.formState.errors.concept?.message}>
        <TextInput {...form.register("concept")} placeholder="Factura de luz" />
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Monto" error={form.formState.errors.amount?.message}>
          <TextInput {...form.register("amount", { valueAsNumber: true })} type="number" min="0" step="0.01" />
        </Field>
        <Field label="Categoria" error={form.formState.errors.categoryId?.message}>
          <SelectInput {...form.register("categoryId")}>
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
        <Button type="submit" busy={pending}>
          Registrar gasto
        </Button>
      </div>
    </form>
  );
}
