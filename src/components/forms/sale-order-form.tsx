"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createSaleOrderAction } from "@/actions/core";
import { ANONYMOUS_CUSTOMER_NAME, PAYMENT_STATUSES } from "@/lib/constants";
import type {
  AppRole,
  BundleRecord,
  ContactRecord,
  LookupOption,
  PriceTierRecord,
  ProductRecord,
  SaleCustomerMode,
  SaleOrderRecord,
} from "@/lib/domain";
import {
  formatQuantity,
  getDirectProductQuantities,
  getRequiredStock,
  groupTiersByProduct,
  resolveProductListPrice,
  roundMoney,
} from "@/lib/pricing";
import { saleOrderFormSchema } from "@/lib/validators";
import { ActionNotice } from "@/components/forms/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import { formatCurrency } from "@/lib/utils";

type SaleOrderValues = z.input<typeof saleOrderFormSchema>;
type SaleOrderOutput = z.output<typeof saleOrderFormSchema>;
type SaleLineValues = {
  productId?: string | null;
  bundleId?: string | null;
  quantity?: unknown;
  unitPrice?: unknown;
};
type CreateSaleOrderResult = {
  sale: SaleOrderRecord;
  contact: ContactRecord;
};

type SaleOrderFormProps = {
  contacts: ContactRecord[];
  products: ProductRecord[];
  channels: LookupOption[];
  priceTiers: PriceTierRecord[];
  bundles: BundleRecord[];
  role: AppRole;
  onSuccess: (result: CreateSaleOrderResult) => void;
};

type LinePricing = {
  product: ProductRecord | null;
  bundle: BundleRecord | null;
  quantity: number;
  listPrice: number;
  tierMinQty: number | null;
  isManual: boolean;
  unitPrice: number;
  subtotal: number;
};

function getInitialItem(products: ProductRecord[]) {
  return {
    productId: products[0]?.id ?? "",
    bundleId: "",
    quantity: 1,
    unitPrice: "" as const,
  };
}

function toLineKey(item: SaleLineValues | undefined) {
  if (item?.bundleId) return `bundle:${item.bundleId}`;
  if (item?.productId) return `product:${item.productId}`;
  return "";
}

function getLinePricing({
  items,
  manualFlags,
  products,
  bundles,
  tiersByProduct,
}: {
  items: SaleLineValues[];
  manualFlags: boolean[];
  products: ProductRecord[];
  bundles: BundleRecord[];
  tiersByProduct: Map<string, PriceTierRecord[]>;
}): LinePricing[] {
  const directQuantities = getDirectProductQuantities(items);

  return items.map((item, index) => {
    const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 0;
    const bundle = item.bundleId ? bundles.find((entry) => entry.id === item.bundleId) ?? null : null;
    const product =
      !bundle && item.productId ? products.find((entry) => entry.id === item.productId) ?? null : null;
    let listPrice = 0;
    let tierMinQty: number | null = null;

    if (bundle) {
      listPrice = bundle.salePrice;
    } else if (product) {
      const resolved = resolveProductListPrice(
        product.salePrice,
        tiersByProduct.get(product.id) ?? [],
        directQuantities.get(product.id) ?? 0,
      );
      listPrice = resolved.unitPrice;
      tierMinQty = resolved.tier?.minQty ?? null;
    }

    const isManual = Boolean(manualFlags[index]);
    const unitPrice = isManual ? Number(item.unitPrice) || 0 : listPrice;

    return {
      product,
      bundle,
      quantity,
      listPrice,
      tierMinQty,
      isManual,
      unitPrice,
      subtotal: roundMoney(unitPrice * quantity),
    };
  });
}

function getStockIssues(items: SaleLineValues[], products: ProductRecord[], bundles: BundleRecord[]) {
  const required = getRequiredStock(items, bundles);
  const issues: string[] = [];

  required.forEach((quantity, productId) => {
    const product = products.find((entry) => entry.id === productId);

    if (product && quantity > product.currentStock) {
      issues.push(
        `${product.name}: requiere ${formatQuantity(quantity)} ${product.unit}, hay ${formatQuantity(product.currentStock)}`,
      );
    }
  });

  return issues;
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

export function SaleOrderForm({
  contacts,
  products,
  channels,
  priceTiers,
  bundles,
  role,
  onSuccess,
}: SaleOrderFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [manualPriceIds, setManualPriceIds] = useState<string[]>([]);
  const isAdmin = role === "admin";
  const tiersByProduct = groupTiersByProduct(priceTiers);
  const form = useForm<SaleOrderValues, unknown, SaleOrderOutput>({
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
  const manualFlags = items.fields.map((field) => isAdmin && manualPriceIds.includes(field.id));
  const linePricing = getLinePricing({
    items: watchedItems as SaleLineValues[],
    manualFlags,
    products,
    bundles,
    tiersByProduct,
  });
  const total = roundMoney(linePricing.reduce((sum, line) => sum + line.subtotal, 0));
  const stockIssues = getStockIssues(watchedItems as SaleLineValues[], products, bundles);
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

  function resetForm() {
    form.reset(getDefaultValues(products, channels));
    setManualPriceIds([]);
    setShowSuggestions(false);
  }

  function setManualPrice(fieldId: string, manual: boolean) {
    setManualPriceIds((current) =>
      manual
        ? current.includes(fieldId)
          ? current
          : [...current, fieldId]
        : current.filter((entry) => entry !== fieldId),
    );
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
      onSubmit={form.handleSubmit(
        (values) => {
          if (!canSubmitSale) {
            setFeedback({
              tone: "error",
              message: `No podemos guardar la venta todavia: falta ${missingDependencies.join(" y ")}.`,
            });
            return;
          }

          const submitPricing = getLinePricing({
            items: values.items,
            manualFlags,
            products,
            bundles,
            tiersByProduct,
          });
          const invalidLine = submitPricing.findIndex((line) => !(line.unitPrice > 0));

          if (invalidLine >= 0) {
            setFeedback({
              tone: "error",
              message: `La linea ${invalidLine + 1} no tiene un precio unitario valido.`,
            });
            return;
          }

          const submitStockIssues = getStockIssues(values.items, products, bundles);

          if (submitStockIssues.length > 0) {
            setFeedback({
              tone: "error",
              message: `Stock insuficiente. ${submitStockIssues.join(". ")}.`,
            });
            return;
          }

          const payload = {
            ...values,
            items: values.items.map((item, index) => ({
              productId: item.bundleId ? undefined : item.productId,
              bundleId: item.bundleId,
              quantity: item.quantity,
              unitPrice: submitPricing[index].unitPrice,
            })),
          };

          setFeedback(null);
          startTransition(async () => {
            const result = await createSaleOrderAction(payload);
            if (result.success && result.data) {
              onSuccess(result.data);
              resetForm();
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
              <Controller
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <TextInput
                    name={field.name}
                    ref={field.ref}
                    value={toInputValue(field.value)}
                    placeholder="Nombre, telefono o mail del cliente"
                    autoComplete="off"
                    onFocus={() => {
                      if (customerMode !== "anonymous") {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      field.onBlur();
                      setTimeout(() => setShowSuggestions(false), 120);
                    }}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      setCustomerMode("inline");
                      form.setValue("contactId", undefined, { shouldDirty: true, shouldValidate: true });
                      setShowSuggestions(true);
                    }}
                  />
                )}
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
          <Controller
            control={form.control}
            name="channelId"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)} disabled={!hasChannels}>
                {!hasChannels ? (
                  <option value="">No hay canales activos disponibles</option>
                ) : null}
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
      </div>

      {customerMode !== "anonymous" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Telefono" error={form.formState.errors.customerPhone?.message}>
            <Controller
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <TextInput {...field} value={toInputValue(field.value)} placeholder="+54 381..." />
              )}
            />
          </Field>
          <Field label="Email" error={form.formState.errors.customerEmail?.message}>
            <Controller
              control={form.control}
              name="customerEmail"
              render={({ field }) => (
                <TextInput
                  {...field}
                  value={toInputValue(field.value)}
                  type="email"
                  placeholder="cliente@ejemplo.com"
                />
              )}
            />
          </Field>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Fecha" error={form.formState.errors.saleDate?.message}>
          <Controller
            control={form.control}
            name="saleDate"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} type="date" />
            )}
          />
        </Field>
        <Field label="Estado de cobro" error={form.formState.errors.paymentStatus?.message}>
          <Controller
            control={form.control}
            name="paymentStatus"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)}>
                {PAYMENT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
        <Field label="Metodo de pago" error={form.formState.errors.paymentMethod?.message}>
          <Controller
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                disabled={paymentStatus === "pending"}
                placeholder="Transferencia"
              />
            )}
          />
        </Field>
        <Field label="Fecha de cobro" error={form.formState.errors.paidAt?.message}>
          <Controller
            control={form.control}
            name="paidAt"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                disabled={paymentStatus === "pending"}
                type="date"
              />
            )}
          />
        </Field>
      </div>

      <div className="rounded-[26px] border border-[var(--line)] bg-[#f7f5ef] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="text-lg font-semibold">Items del pedido</h4>
            <p className="text-sm text-[var(--muted)]">
              Cada linea es un producto o un combo y descuenta stock al confirmar la venta.
            </p>
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
            const line = linePricing[index];
            const itemErrors = form.formState.errors.items?.[index];
            const unitLabel = line?.bundle ? "combo" : line?.product?.unit ?? "unidad";
            let priceHint = "Precio de lista";

            if (line?.bundle) {
              priceHint = "Precio fijo del combo";
            } else if (line?.tierMinQty !== null && line?.tierMinQty !== undefined) {
              priceHint = `Escala desde ${formatQuantity(line.tierMinQty)} u.`;
            }

            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-[24px] border border-[var(--line)] bg-white/90 p-4 md:grid-cols-[1.6fr_0.7fr_0.9fr_auto]"
              >
                <Field
                  label="Producto o combo"
                  error={itemErrors?.productId?.message ?? itemErrors?.bundleId?.message}
                >
                  <SelectInput
                    value={toLineKey(watchedItems[index] as SaleLineValues | undefined)}
                    disabled={!hasProducts}
                    onChange={(event) => {
                      const [kind, id] = event.target.value.split(":");
                      form.setValue(`items.${index}.productId`, kind === "product" ? id : "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.setValue(`items.${index}.bundleId`, kind === "bundle" ? id : "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.setValue(`items.${index}.unitPrice`, "", { shouldDirty: true });
                      setManualPrice(field.id, false);
                    }}
                  >
                    {!hasProducts ? (
                      <option value="">No hay productos activos disponibles</option>
                    ) : null}
                    <optgroup label="Productos">
                      {products.map((product) => (
                        <option key={product.id} value={`product:${product.id}`}>
                          {product.name}
                        </option>
                      ))}
                    </optgroup>
                    {bundles.length > 0 ? (
                      <optgroup label="Combos">
                        {bundles.map((bundle) => (
                          <option key={bundle.id} value={`bundle:${bundle.id}`}>
                            {bundle.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </SelectInput>
                </Field>

                <Field label="Cantidad" error={itemErrors?.quantity?.message}>
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
                        min="0"
                        step="0.01"
                      />
                    )}
                  />
                </Field>

                <div className="space-y-2">
                  <Field
                    label="Precio unitario"
                    error={itemErrors?.unitPrice?.message}
                    hint={isAdmin ? undefined : "Solo un administrador puede cambiar el precio."}
                  >
                    <Controller
                      control={form.control}
                      name={`items.${index}.unitPrice`}
                      render={({ field: itemField }) => (
                        <TextInput
                          name={itemField.name}
                          ref={itemField.ref}
                          value={line?.isManual ? toInputValue(itemField.value) : toInputValue(line?.listPrice ?? "")}
                          onBlur={itemField.onBlur}
                          readOnly={!isAdmin}
                          onChange={(event) => {
                            if (!isAdmin) {
                              return;
                            }

                            setManualPrice(field.id, true);
                            itemField.onChange(toNumberValue(event.target.value));
                          }}
                          type="number"
                          min="0.01"
                          step="0.01"
                          className={!isAdmin ? "bg-[#f4f2e9]" : undefined}
                        />
                      )}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    {line?.isManual ? (
                      <>
                        <Badge tone="warning">Precio manual</Badge>
                        <span>Lista: {formatCurrency(line.listPrice)}</span>
                        <button
                          type="button"
                          className="font-semibold text-[#1e5f44] underline-offset-2 hover:underline"
                          onClick={() => {
                            setManualPrice(field.id, false);
                            form.setValue(`items.${index}.unitPrice`, "", { shouldDirty: true });
                          }}
                        >
                          Usar precio de lista
                        </button>
                      </>
                    ) : (
                      <Badge tone={line && (line.tierMinQty !== null || line.bundle) ? "accent" : "neutral"}>
                        {priceHint}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <div className="min-w-28 rounded-2xl bg-[#eef4ea] px-3 py-3 text-sm font-semibold text-[#1e5f44]">
                    {formatCurrency(line?.subtotal ?? 0)}
                    <div className="mt-1 text-xs font-medium text-[#55755e]">
                      Subtotal / {unitLabel}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Quitar item ${index + 1}`}
                    disabled={items.fields.length <= 1}
                    onClick={() => {
                      if (items.fields.length > 1) {
                        setManualPrice(field.id, false);
                        items.remove(index);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {line?.bundle ? (
                  <p className="text-xs text-[var(--muted)] md:col-span-4">
                    Incluye:{" "}
                    {line.bundle.items
                      .map(
                        (component) =>
                          `${component.productName} x ${formatQuantity(component.quantity * (line.quantity || 1))}`,
                      )
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {stockIssues.length > 0 ? (
          <div className="mt-3">
            <ActionNotice
              tone="warning"
              message={`Stock insuficiente (sumando productos y combos): ${stockIssues.join("; ")}.`}
            />
          </div>
        ) : null}
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
              placeholder="Observaciones del pedido."
            />
          )}
        />
      </Field>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex items-center justify-between rounded-[24px] border border-[var(--line)] bg-[#eef4ea] px-4 py-4">
        <div>
          <p className="text-sm text-[#55755e]">Total</p>
          <p className="text-2xl font-semibold text-[#15553e]">{formatCurrency(total)}</p>
        </div>
        <Button type="submit" busy={pending} disabled={!canSubmitSale}>
          Guardar venta
        </Button>
      </div>
    </form>
  );
}
