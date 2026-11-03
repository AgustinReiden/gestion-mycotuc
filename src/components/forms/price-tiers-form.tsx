"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { savePriceTiersAction } from "@/actions/core";
import { ActionNotice } from "@/components/forms/action-notice";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/fields";
import type { PriceTierRecord, ProductRecord } from "@/lib/domain";
import { formatQuantity } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import { priceTiersFormSchema } from "@/lib/validators";

type PriceTiersFormValues = z.input<typeof priceTiersFormSchema>;
type PriceTiersFormOutput = z.output<typeof priceTiersFormSchema>;

type PriceTiersFormProps = {
  product: ProductRecord;
  tiers: PriceTierRecord[];
  onSuccess: (tiers: PriceTierRecord[]) => void;
};

export function PriceTiersForm({ product, tiers, onSuccess }: PriceTiersFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<PriceTiersFormValues, unknown, PriceTiersFormOutput>({
    resolver: zodResolver(priceTiersFormSchema),
    defaultValues: {
      productId: product.id,
      tiers: [...tiers]
        .sort((left, right) => left.minQty - right.minQty)
        .map((tier) => ({ minQty: tier.minQty, unitPrice: tier.unitPrice })),
    },
  });
  const rows = useFieldArray({ control: form.control, name: "tiers" });
  const watchedTiers = useWatch({ control: form.control, name: "tiers" }) ?? [];
  const preview = watchedTiers
    .map((tier) => ({ minQty: Number(tier?.minQty) || 0, unitPrice: Number(tier?.unitPrice) || 0 }))
    .filter((tier) => tier.minQty > 0 && tier.unitPrice > 0)
    .sort((left, right) => left.minQty - right.minQty);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await savePriceTiersAction(values);
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
      <div className="rounded-2xl border border-[var(--line)] bg-[#f7f5ef] px-4 py-3 text-sm text-[var(--muted)]">
        Precio base de {product.name}: <strong>{formatCurrency(product.salePrice)}</strong>. Se aplica la
        escala mas alta alcanzada por la cantidad total del producto en la venta; si no se alcanza
        ninguna, se usa el precio base.
      </div>

      <div className="space-y-3">
        {rows.fields.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Sin escalas: el producto se vende siempre a precio base.
          </p>
        ) : null}
        {rows.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1fr_1fr_auto]"
          >
            <Field
              label="Cantidad minima"
              error={form.formState.errors.tiers?.[index]?.minQty?.message}
            >
              <Controller
                control={form.control}
                name={`tiers.${index}.minQty`}
                render={({ field: rowField }) => (
                  <TextInput
                    name={rowField.name}
                    ref={rowField.ref}
                    value={toInputValue(rowField.value)}
                    onBlur={rowField.onBlur}
                    onChange={(event) => rowField.onChange(toNumberValue(event.target.value))}
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                )}
              />
            </Field>
            <Field
              label="Precio unitario"
              error={form.formState.errors.tiers?.[index]?.unitPrice?.message}
            >
              <Controller
                control={form.control}
                name={`tiers.${index}.unitPrice`}
                render={({ field: rowField }) => (
                  <TextInput
                    name={rowField.name}
                    ref={rowField.ref}
                    value={toInputValue(rowField.value)}
                    onBlur={rowField.onBlur}
                    onChange={(event) => rowField.onChange(toNumberValue(event.target.value))}
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                )}
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                aria-label={`Quitar escala ${index + 1}`}
                onClick={() => rows.remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => rows.append({ minQty: "", unitPrice: "" })}
      >
        <Plus className="h-4 w-4" />
        Agregar escala
      </Button>

      {preview.length > 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[#eef4ea] px-4 py-3 text-sm text-[#1e5f44]">
          <p className="font-semibold">Asi quedan ordenadas</p>
          <ul className="mt-1 space-y-1">
            {preview.map((tier, index) => (
              <li key={`${tier.minQty}-${index}`}>
                Desde {formatQuantity(tier.minQty)} {product.unit}: {formatCurrency(tier.unitPrice)} c/u
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          Guardar escalas
        </Button>
      </div>
    </form>
  );
}
