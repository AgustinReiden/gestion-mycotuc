"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { saveProductCategoryAction } from "@/actions/catalog";
import { ActionNotice } from "@/components/forms/action-notice";
import { getFirstFormError, toInputValue } from "@/components/forms/value-helpers";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/fields";
import type { ProductCategoryRecord } from "@/lib/domain";
import { productCategoryFormSchema } from "@/lib/validators";

type ProductCategoryFormValues = z.input<typeof productCategoryFormSchema>;
type ProductCategoryFormOutput = z.output<typeof productCategoryFormSchema>;

type ProductCategoryFormProps = {
  category: ProductCategoryRecord | null;
  onSuccess: (category: ProductCategoryRecord) => void;
  onCancel: () => void;
};

export function ProductCategoryForm({ category, onSuccess, onCancel }: ProductCategoryFormProps) {
  "use no memo";

  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ProductCategoryFormValues, unknown, ProductCategoryFormOutput>({
    resolver: zodResolver(productCategoryFormSchema),
    defaultValues: {
      id: category?.id,
      name: category?.name ?? "",
      isActive: category?.isActive ?? true,
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveProductCategoryAction(values);
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
      <Field
        label={category ? "Nombre de la categoría" : "Nueva categoría"}
        error={form.formState.errors.name?.message}
        hint={category ? "Al renombrarla, sus productos pasan al nombre nuevo." : undefined}
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <TextInput {...field} value={toInputValue(field.value)} placeholder="Hongos Secos" autoFocus />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" busy={pending}>
          {category ? "Guardar nombre" : "Crear categoría"}
        </Button>
      </div>
    </form>
  );
}
