"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { registerSupplyPurchaseAction } from "@/actions/supplies";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import type {
  ContactRecord,
  ExpenseRecord,
  InventoryMovementRecord,
  PurchaseRecord,
  SupplyRecord,
} from "@/lib/domain";
import { purchaseFormSchema } from "@/lib/validators";
import { formatCurrency, todayISO } from "@/lib/utils";

type PurchaseFormValues = z.input<typeof purchaseFormSchema>;

type PurchaseFormProps = {
  suppliers: ContactRecord[];
  supplies: SupplyRecord[];
  onSuccess: (result: {
    purchase: PurchaseRecord;
    expense: ExpenseRecord | null;
    supplies: SupplyRecord[];
    movements: InventoryMovementRecord[];
  }) => void;
};

function getInitialItem(supplies: SupplyRecord[]) {
  return {
    supplyId: supplies[0]?.id ?? "",
    quantity: 1,
    unitCost: 0,
  };
}

export function PurchaseForm({ suppliers, supplies, onSuccess }: PurchaseFormProps) {
  "use no memo";

  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      supplierId: suppliers[0]?.id ?? "",
      purchaseDate: todayISO(),
      notes: "",
      items: [getInitialItem(supplies)],
    },
  });

  const items = useFieldArray({
    control: form.control,
    name: "items",
  });
  const hasSuppliers = suppliers.length > 0;
  const hasSupplies = supplies.length > 0;
  const missingDependencies = [
    !hasSuppliers ? "al menos un proveedor activo" : null,
    !hasSupplies ? "al menos un insumo activo" : null,
  ].filter(Boolean);
  const canSubmitPurchase = missingDependencies.length === 0;

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  }) ?? [];
  const total = watchedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0);

  useEffect(() => {
    form.reset({
      supplierId: suppliers[0]?.id ?? "",
      purchaseDate: todayISO(),
      notes: "",
      items: [getInitialItem(supplies)],
    });
  }, [form, suppliers, supplies]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          if (!canSubmitPurchase) {
            setFeedback({
              tone: "error",
              message: `No podemos registrar la compra todavía: falta ${missingDependencies.join(" y ")}.`,
            });
            return;
          }

          setFeedback(null);
          startTransition(async () => {
            const result = await registerSupplyPurchaseAction(values);
            if (result.success && result.data) {
              onSuccess(result.data);
              form.reset({
                supplierId: suppliers[0]?.id ?? "",
                purchaseDate: todayISO(),
                notes: "",
                items: [getInitialItem(supplies)],
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
      {!canSubmitPurchase ? (
        <ActionNotice
          tone="warning"
          message={`Antes de registrar una compra, creá ${missingDependencies.join(" y ")}.`}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proveedor" error={form.formState.errors.supplierId?.message}>
          <Controller
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)} disabled={!hasSuppliers}>
                {!hasSuppliers ? (
                  <option value="">No hay proveedores activos disponibles</option>
                ) : null}
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
        <Field label="Fecha de compra" error={form.formState.errors.purchaseDate?.message}>
          <Controller
            control={form.control}
            name="purchaseDate"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} type="date" />
            )}
          />
        </Field>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold">Ítems comprados</h4>
            <p className="text-sm text-[var(--muted)]">Cada línea aumenta stock y genera el gasto asociado.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!hasSupplies}
            onClick={() => items.append(getInitialItem(supplies))}
          >
            <Plus className="h-4 w-4" />
            Agregar ítem
          </Button>
        </div>

        <div className="space-y-3">
          {items.fields.map((field, index) => {
            const selectedSupplyId = watchedItems[index]?.supplyId;
            const selectedSupply = supplies.find((supply) => supply.id === selectedSupplyId);

            return (
              <div key={field.id} className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3.5 sm:grid-cols-[1.7fr_0.7fr_0.8fr_auto]">
                <Field label="Insumo" error={form.formState.errors.items?.[index]?.supplyId?.message}>
                  <Controller
                    control={form.control}
                    name={`items.${index}.supplyId`}
                    render={({ field: itemField }) => (
                      <SelectInput
                        {...itemField}
                        value={toInputValue(itemField.value)}
                        disabled={!hasSupplies}
                      >
                        {!hasSupplies ? (
                          <option value="">No hay insumos activos disponibles</option>
                        ) : null}
                        {supplies.map((supply) => (
                          <option key={supply.id} value={supply.id}>
                            {supply.name}
                          </option>
                        ))}
                      </SelectInput>
                    )}
                  />
                </Field>
                <Field label="Cantidad" error={form.formState.errors.items?.[index]?.quantity?.message}>
                  <Controller
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field: itemField }) => (
                      <TextInput
                        name={itemField.name}
                        ref={itemField.ref}
                        value={toInputValue(itemField.value)}
                        onBlur={itemField.onBlur}
                        onChange={(event) => itemField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                      />
                    )}
                  />
                </Field>
                <Field label="Costo unitario" error={form.formState.errors.items?.[index]?.unitCost?.message}>
                  <Controller
                    control={form.control}
                    name={`items.${index}.unitCost`}
                    render={({ field: itemField }) => (
                      <TextInput
                        name={itemField.name}
                        ref={itemField.ref}
                        value={toInputValue(itemField.value)}
                        onBlur={itemField.onBlur}
                        onChange={(event) => itemField.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                      />
                    )}
                  />
                </Field>

                <div className="flex items-end gap-2">
                  <div className="min-w-28 flex-1 rounded-[var(--radius-control)] bg-[var(--moss-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--moss)] sm:flex-none">
                    {formatCurrency((Number(watchedItems[index]?.quantity) || 0) * (Number(watchedItems[index]?.unitCost) || 0))}
                    <div className="mt-1 text-xs font-medium text-[var(--ink-2)]">{selectedSupply?.unit ?? "unidad"}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    aria-label={`Quitar insumo ${index + 1}`}
                    disabled={items.fields.length <= 1}
                    onClick={() => (items.fields.length > 1 ? items.remove(index) : null)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput
              {...field}
              value={toInputValue(field.value)}
              rows={3}
              placeholder="Datos del proveedor, factura o entrega."
            />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--muted)]">Total estimado</p>
          <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-[var(--moss)]">{formatCurrency(total)}</p>
        </div>
        <Button type="submit" size="lg" busy={pending} disabled={!canSubmitPurchase}>
          Registrar compra
        </Button>
      </div>
    </form>
  );
}
