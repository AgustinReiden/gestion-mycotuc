"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createSaleOrderAction } from "@/actions/core";
import { ANONYMOUS_CUSTOMER_NAME, PAYMENT_STATUSES } from "@/lib/constants";
import type {
  ContactRecord,
  LookupOption,
  ProductRecord,
  SaleCustomerMode,
  SaleOrderRecord,
} from "@/lib/domain";
import { saleOrderFormSchema } from "@/lib/validators";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { formatCurrency } from "@/lib/utils";

type SaleOrderValues = z.input<typeof saleOrderFormSchema>;
type CreateSaleOrderResult = {
  sale: SaleOrderRecord;
  contact: ContactRecord;
};

type SaleOrderFormProps = {
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  onSuccess: (result: CreateSaleOrderResult) => void;
};

function getInitialItem(products: ProductRecord[]) {
  const product = products[0];

  return {
    productId: product?.id ?? "",
    quantity: 1,
    unitPrice: product?.salePrice ?? 0,
  };
}

function getDefaultValues(products: ProductRecord[], channels: LookupOption[]): SaleOrderValues {
  return {
    customerMode: "inline",
    contactId: undefined,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    saleDate: new Date().toISOString().slice(0, 10),
    channelId: channels[0]?.id ?? "",
    paymentStatus: "pending",
    paymentMethod: "",
    paidAt: "",
    notes: "",
    items: [getInitialItem(products)],
  };
}

function toSearchTerms(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function sortContactsByRecent(list: ContactRecord[]) {
  return [...list].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getCustomerHint(mode: SaleCustomerMode, hasSelectedContact: boolean) {
  if (mode === "anonymous") {
    return "La venta se guardara con un cliente generico para no frenar la carga.";
  }

  if (hasSelectedContact) {
    return "Se reutiliza un cliente existente y puedes completar telefono o mail si hace falta.";
  }

  return "Escribe nombre, telefono o mail para ver sugerencias. Si no coincide nadie, se crea al guardar.";
}

export function SaleOrderForm({ contacts, products, channels, onSuccess }: SaleOrderFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const form = useForm<SaleOrderValues>({
    resolver: zodResolver(saleOrderFormSchema),
    defaultValues: getDefaultValues(products, channels),
  });

  useEffect(() => {
    form.register("contactId");
    form.register("customerMode");
  }, [form]);

  const items = useFieldArray({
    control: form.control,
    name: "items",
  });
  const hasProducts = products.length > 0;
  const hasChannels = channels.length > 0;
  const missingDependencies = [
    !hasProducts ? "al menos un producto activo" : null,
    !hasChannels ? "al menos un canal de venta activo" : null,
  ].filter(Boolean);
  const canSubmitSale = missingDependencies.length === 0;

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  }) ?? [];
  const customerMode = (useWatch({
    control: form.control,
    name: "customerMode",
  }) ?? "inline") as SaleCustomerMode;
  const customerName = useWatch({
    control: form.control,
    name: "customerName",
  }) ?? "";
  const selectedContactId = useWatch({
    control: form.control,
    name: "contactId",
  });
  const paymentStatus = useWatch({
    control: form.control,
    name: "paymentStatus",
  });
  const total = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const customerTerms = customerMode === "anonymous" ? [] : toSearchTerms(customerName);
  const suggestedContacts =
    customerTerms.length === 0
      ? sortContactsByRecent(contacts).slice(0, 6)
      : contacts
          .filter((contact) => {
            const haystack = [contact.name, contact.phone, contact.email]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return customerTerms.every((term) => haystack.includes(term));
          })
          .slice(0, 6);

  const customerNameField = form.register("customerName");

  function resetForm() {
    form.reset(getDefaultValues(products, channels));
    setShowSuggestions(false);
  }

  function setCustomerMode(mode: SaleCustomerMode) {
    form.setValue("customerMode", mode, { shouldDirty: true, shouldValidate: true });
  }

  function selectExistingContact(contact: ContactRecord) {
    setCustomerMode("existing");
    form.setValue("contactId", contact.id, { shouldDirty: true, shouldValidate: true });
    form.setValue("customerName", contact.name, { shouldDirty: true, shouldValidate: true });
    form.setValue("customerPhone", contact.phone ?? "", { shouldDirty: true });
    form.setValue("customerEmail", contact.email ?? "", { shouldDirty: true });
    setShowSuggestions(false);
  }

  function useAnonymousCustomer() {
    setCustomerMode("anonymous");
    form.setValue("contactId", undefined, { shouldDirty: true, shouldValidate: true });
    form.setValue("customerName", ANONYMOUS_CUSTOMER_NAME, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("customerPhone", "", { shouldDirty: true });
    form.setValue("customerEmail", "", { shouldDirty: true });
    setShowSuggestions(false);
  }

  function clearCustomer() {
    setCustomerMode("inline");
    form.setValue("contactId", undefined, { shouldDirty: true, shouldValidate: true });
    form.setValue("customerName", "", { shouldDirty: true, shouldValidate: true });
    form.setValue("customerPhone", "", { shouldDirty: true });
    form.setValue("customerEmail", "", { shouldDirty: true });
    setShowSuggestions(false);
  }

  useEffect(() => {
    form.reset(getDefaultValues(products, channels));
  }, [channels, form, products]);

  useEffect(() => {
    if (paymentStatus === "pending") {
      form.setValue("paymentMethod", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("paidAt", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [form, paymentStatus]);

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => {
        if (!canSubmitSale) {
          setFeedback({
            tone: "error",
            message: `No podemos guardar la venta todavia: falta ${missingDependencies.join(" y ")}.`,
          });
          return;
        }

        setFeedback(null);
        startTransition(async () => {
          const result = await createSaleOrderAction(values);
          if (result.success && result.data) {
            onSuccess(result.data);
            resetForm();
            return;
          }

          setFeedback({ tone: "error", message: result.error ?? result.message });
        });
      })}
    >
      {!canSubmitSale ? (
        <ActionNotice
          tone="warning"
          message={`Antes de registrar una venta, crea ${missingDependencies.join(" y ")}.`}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
        <Field
          label="Cliente"
          error={form.formState.errors.customerName?.message}
          hint={getCustomerHint(customerMode, Boolean(selectedContact))}
        >
          <div className="space-y-3">
            <div className="relative">
              <TextInput
                {...customerNameField}
                value={customerName}
                placeholder="Nombre, telefono o mail del cliente"
                autoComplete="off"
                onFocus={() => {
                  if (customerMode !== "anonymous") {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 120);
                }}
                onChange={(event) => {
                  customerNameField.onChange(event);
                  setCustomerMode("inline");
                  form.setValue("contactId", undefined, { shouldDirty: true, shouldValidate: true });
                  setShowSuggestions(true);
                }}
              />

              {showSuggestions && suggestedContacts.length > 0 ? (
                <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 rounded-[22px] border border-[var(--line)] bg-white p-2 shadow-[0_18px_40px_rgba(46,54,40,0.12)]">
                  <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#55755e]">
                    {customerTerms.length > 0 ? "Sugerencias" : "Clientes recientes"}
                  </p>
                  <div className="space-y-1">
                    {suggestedContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[#f6f4ed]"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectExistingContact(contact);
                        }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {contact.name}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            {[contact.phone, contact.email].filter(Boolean).join(" / ") || "Sin datos adicionales"}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#eef4ea] px-3 py-1 text-[11px] font-semibold text-[#1e5f44]">
                          Usar
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {showSuggestions && customerTerms.length > 0 && suggestedContacts.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">
                No encontramos coincidencias. Si sigues con este nombre, se guardara como cliente nuevo.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={useAnonymousCustomer}>
                Usar cliente N/A
              </Button>
              {(customerName || selectedContact || customerMode === "anonymous") && (
                <Button type="button" variant="ghost" onClick={clearCustomer}>
                  Limpiar
                </Button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Canal" error={form.formState.errors.channelId?.message}>
          <SelectInput {...form.register("channelId")} disabled={!hasChannels}>
            {!hasChannels ? (
              <option value="">No hay canales activos disponibles</option>
            ) : null}
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      {customerMode !== "anonymous" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Telefono" error={form.formState.errors.customerPhone?.message}>
            <TextInput {...form.register("customerPhone")} placeholder="+54 381..." />
          </Field>
          <Field label="Email" error={form.formState.errors.customerEmail?.message}>
            <TextInput
              {...form.register("customerEmail")}
              type="email"
              placeholder="cliente@ejemplo.com"
            />
          </Field>
        </div>
      ) : null}

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
          <TextInput
            {...form.register("paymentMethod")}
            disabled={paymentStatus === "pending"}
            placeholder="Transferencia"
          />
        </Field>
        <Field label="Fecha de cobro" error={form.formState.errors.paidAt?.message}>
          <TextInput
            {...form.register("paidAt")}
            disabled={paymentStatus === "pending"}
            type="date"
          />
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
            disabled={!hasProducts}
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
              <div
                key={field.id}
                className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.7fr_0.8fr_auto]"
              >
                <Field label="Producto" error={form.formState.errors.items?.[index]?.productId?.message}>
                  <SelectInput
                    {...form.register(`items.${index}.productId`)}
                    disabled={!hasProducts}
                    onChange={(event) => {
                      form.register(`items.${index}.productId`).onChange(event);
                      const product = products.find((entry) => entry.id === event.target.value);
                      form.setValue(`items.${index}.unitPrice`, product?.salePrice ?? 0);
                    }}
                  >
                    {!hasProducts ? (
                      <option value="">No hay productos activos disponibles</option>
                    ) : null}
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
                    min="0.01"
                    step="0.01"
                  />
                </Field>

                <div className="flex items-end gap-2">
                  <div className="min-w-28 rounded-2xl bg-[#eef4ea] px-3 py-3 text-sm font-semibold text-[#1e5f44]">
                    {formatCurrency(
                      (Number(watchedItems[index]?.quantity) || 0) *
                        (Number(watchedItems[index]?.unitPrice) || 0),
                    )}
                    <div className="mt-1 text-xs font-medium text-[#55755e]">
                      {selectedProduct?.unit ?? "unidad"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Quitar item ${index + 1}`}
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
        <TextareaInput {...form.register("notes")} rows={3} placeholder="Observaciones del pedido." />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex items-center justify-between rounded-[24px] border border-[var(--line)] bg-[#eef4ea] px-4 py-4">
        <div>
          <p className="text-sm text-[#55755e]">Total estimado</p>
          <p className="text-2xl font-semibold text-[#15553e]">{formatCurrency(total)}</p>
        </div>
        <Button type="submit" busy={pending} disabled={!canSubmitSale}>
          Guardar venta
        </Button>
      </div>
    </form>
  );
}
