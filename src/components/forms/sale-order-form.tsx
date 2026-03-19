"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createSaleOrderAction } from "@/actions/core";
import { PAYMENT_STATUSES } from "@/lib/constants";
import type { ContactRecord, LookupOption, ProductRecord } from "@/lib/domain";
import { saleOrderFormSchema } from "@/lib/validators";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { formatCurrency } from "@/lib/utils";

type SaleOrderValues = z.input<typeof saleOrderFormSchema>;

type SaleOrderFormProps = {
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  onSuccess: () => void;
};

function getInitialItem(products: ProductRecord[]) {
  const product = products[0];

  return {
    productId: product?.id ?? "",
    quantity: 1,
    unitPrice: product?.salePrice ?? 0,
  };
}

export function SaleOrderForm({ contacts, products, channels, onSuccess }: SaleOrderFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<SaleOrderValues>({
    resolver: zodResolver(saleOrderFormSchema),
    defaultValues: {
      contactId: contacts[0]?.id ?? "",
      saleDate: new Date().toISOString().slice(0, 10),
      channelId: channels[0]?.id ?? "",
      paymentStatus: "pending",
      paymentMethod: "",
      paidAt: "",
      notes: "",
      items: [getInitialItem(products)],
    },
  });

  const items = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  });
  const total = watchedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);

  useEffect(() => {
    form.reset({
      contactId: contacts[0]?.id ?? "",
      saleDate: new Date().toISOString().slice(0, 10),
      channelId: channels[0]?.id ?? "",
      paymentStatus: "pending",
      paymentMethod: "",
      paidAt: "",
      notes: "",
      items: [getInitialItem(products)],
    });
  }, [channels, contacts, form, products]);

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        startTransition(async () => {
          const result = await createSaleOrderAction(values);
          if (result.success) {
            setFeedback({ tone: "success", message: result.message });
            onSuccess();
            form.reset({
              contactId: contacts[0]?.id ?? "",
              saleDate: new Date().toISOString().slice(0, 10),
              channelId: channels[0]?.id ?? "",
              paymentStatus: "pending",
              paymentMethod: "",
              paidAt: "",
              notes: "",
              items: [getInitialItem(products)],
            });
            return;
          }

          setFeedback({ tone: "error", message: result.error ?? result.message });
        });
      })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Cliente" error={form.formState.errors.contactId?.message}>
          <SelectInput {...form.register("contactId")}>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Canal" error={form.formState.errors.channelId?.message}>
          <SelectInput {...form.register("channelId")}>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Fecha" error={form.formState.errors.saleDate?.message}>
          <TextInput {...form.register("saleDate")} type="date" />
        </Field>
        <Field label="Estado de cobro" error={form.formState.errors.paymentStatus?.message}>
          <SelectInput {...form.register("paymentStatus")}>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Metodo de pago" error={form.formState.errors.paymentMethod?.message}>
          <TextInput {...form.register("paymentMethod")} placeholder="Transferencia" />
        </Field>
        <Field label="Fecha de cobro" error={form.formState.errors.paidAt?.message}>
          <TextInput {...form.register("paidAt")} type="date" />
        </Field>
      </div>

      <div className="rounded-[26px] border border-[var(--line)] bg-[#f7f5ef] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold">Items del pedido</h4>
            <p className="text-sm text-[var(--muted)]">Cada linea descuenta stock al confirmar la venta.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => items.append(getInitialItem(products))}
          >
            <Plus className="h-4 w-4" />
            Agregar item
          </Button>
        </div>

        <div className="space-y-3">
          {items.fields.map((field, index) => {
            const selectedProductId = watchedItems[index]?.productId;
            const selectedProduct = products.find((product) => product.id === selectedProductId);

            return (
              <div key={field.id} className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.7fr_0.8fr_auto]">
                <Field label="Producto" error={form.formState.errors.items?.[index]?.productId?.message}>
                  <SelectInput
                    {...form.register(`items.${index}.productId`)}
                    onChange={(event) => {
                      form.register(`items.${index}.productId`).onChange(event);
                      const product = products.find((entry) => entry.id === event.target.value);
                      form.setValue(`items.${index}.unitPrice`, product?.salePrice ?? 0);
                    }}
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                <Field label="Cantidad" error={form.formState.errors.items?.[index]?.quantity?.message}>
                  <TextInput
                    {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <Field label="Precio unitario" error={form.formState.errors.items?.[index]?.unitPrice?.message}>
                  <TextInput
                    {...form.register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>

                <div className="flex items-end gap-2">
                  <div className="min-w-28 rounded-2xl bg-[#eef4ea] px-3 py-3 text-sm font-semibold text-[#1e5f44]">
                    {formatCurrency((Number(watchedItems[index]?.quantity) || 0) * (Number(watchedItems[index]?.unitPrice) || 0))}
                    <div className="mt-1 text-xs font-medium text-[#55755e]">{selectedProduct?.unit ?? "unidad"}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
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
        <TextareaInput {...form.register("notes")} rows={3} placeholder="Observaciones del pedido." />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex items-center justify-between rounded-[24px] border border-[var(--line)] bg-[#eef4ea] px-4 py-4">
        <div>
          <p className="text-sm text-[#55755e]">Total estimado</p>
          <p className="text-2xl font-semibold text-[#15553e]">{formatCurrency(total)}</p>
        </div>
        <Button type="submit" busy={pending}>
          Guardar venta
        </Button>
      </div>
    </form>
  );
}
