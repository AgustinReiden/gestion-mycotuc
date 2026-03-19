"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { saveProductAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import type { ProductRecord } from "@/lib/domain";
import { productFormSchema } from "@/lib/validators";

type ProductFormValues = z.input<typeof productFormSchema>;

type ProductFormProps = {
  product?: ProductRecord | null;
  onSuccess: () => void;
};

export function ProductForm({ product, onSuccess }: ProductFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      id: product?.id,
      name: product?.name ?? "",
      category: product?.category ?? "",
      unit: product?.unit ?? "frasco",
      salePrice: product?.salePrice ?? 0,
      minStock: product?.minStock ?? 0,
      notes: product?.notes ?? "",
      isActive: product?.isActive ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      id: product?.id,
      name: product?.name ?? "",
      category: product?.category ?? "",
      unit: product?.unit ?? "frasco",
      salePrice: product?.salePrice ?? 0,
      minStock: product?.minStock ?? 0,
      notes: product?.notes ?? "",
      isActive: product?.isActive ?? true,
    });
  }, [product, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        startTransition(async () => {
          const result = await saveProductAction(values);
          if (result.success) {
            setFeedback({ tone: "success", message: result.message });
            onSuccess();
            form.reset({
              name: "",
              category: "",
              unit: "frasco",
              salePrice: 0,
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
          <TextInput {...form.register("name")} placeholder="Extracto Reishi" />
        </Field>
        <Field label="Categoria" error={form.formState.errors.category?.message}>
          <TextInput {...form.register("category")} placeholder="Extractos" />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Unidad" error={form.formState.errors.unit?.message}>
          <TextInput {...form.register("unit")} placeholder="frasco" />
        </Field>
        <Field label="Precio de venta" error={form.formState.errors.salePrice?.message}>
          <TextInput {...form.register("salePrice", { valueAsNumber: true })} type="number" min="0" step="0.01" />
        </Field>
        <Field label="Stock minimo" error={form.formState.errors.minStock?.message}>
          <TextInput {...form.register("minStock", { valueAsNumber: true })} type="number" min="0" step="0.01" />
        </Field>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <TextareaInput {...form.register("notes")} rows={4} placeholder="Formato, presentacion o datos utiles." />
      </Field>

      <label className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...form.register("isActive")} />
        Producto activo
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
