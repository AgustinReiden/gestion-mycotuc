"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Minus, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createSaleOrderAction } from "@/actions/sales";
import { ANONYMOUS_CUSTOMER_NAME, PAYMENT_STATUSES } from "@/lib/constants";
import type {
  AppRole,
  BundleRecord,
  CategoryScaleRecord,
  ContactRecord,
  LookupOption,
  PriceTierRecord,
  ProductRecord,
  SaleCustomerMode,
  SaleOrderRecord,
} from "@/lib/domain";
import { priceCategoryScales } from "@/lib/category-scales";
import { getPartialAmountError, getSaleBalance } from "@/lib/finance";
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
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";
import { cn, formatCurrency, todayISO } from "@/lib/utils";

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
  categoryScales: CategoryScaleRecord[];
  role: AppRole;
  onSuccess: (result: CreateSaleOrderResult) => void;
};

type LinePricing = {
  product: ProductRecord | null;
  bundle: BundleRecord | null;
  quantity: number;
  listPrice: number;
  tierMinQty: number | null;
  scaleMinQty: number | null;
  isManual: boolean;
  unitPrice: number;
  subtotal: number;
};

const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta"] as const;
const PICKER_SEARCH_THRESHOLD = 8;

function getLinePricing({
  items,
  manualFlags,
  products,
  bundles,
  categoryScales,
  tiersByProduct,
}: {
  items: SaleLineValues[];
  manualFlags: boolean[];
  products: ProductRecord[];
  bundles: BundleRecord[];
  categoryScales: CategoryScaleRecord[];
  tiersByProduct: Map<string, PriceTierRecord[]>;
}): LinePricing[] {
  const directQuantities = getDirectProductQuantities(items);
  const scaledLines = priceCategoryScales(items, products, categoryScales);

  return items.map((item, index) => {
    const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 0;
    const bundle = item.bundleId ? bundles.find((entry) => entry.id === item.bundleId) ?? null : null;
    const product =
      !bundle && item.productId ? products.find((entry) => entry.id === item.productId) ?? null : null;
    let listPrice = 0;
    let tierMinQty: number | null = null;
    let scaleMinQty: number | null = null;
    let scaledTotal: number | null = null;
    const scaled = scaledLines.get(index);

    if (bundle) {
      listPrice = bundle.salePrice;
    } else if (product && scaled && quantity > 0) {
      listPrice = roundMoney(scaled.lineTotal / quantity);
      scaleMinQty = scaled.tierMinQty;
      scaledTotal = scaled.lineTotal;
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
      scaleMinQty,
      isManual,
      unitPrice,
      subtotal: !isManual && scaledTotal !== null ? scaledTotal : roundMoney(unitPrice * quantity),
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
        `${product.name}: pedís ${formatQuantity(quantity)} ${product.unit} y hay ${formatQuantity(product.currentStock)}`,
      );
    }
  });

  return issues;
}

function getDefaultValues(channels: LookupOption[]): SaleOrderValues {
  return {
    customerMode: "inline",
    contactId: undefined,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    saleDate: todayISO(),
    channelId: channels[0]?.id ?? "",
    paymentStatus: "pending",
    paymentMethod: "",
    paidAt: "",
    amountPaid: "",
    notes: "",
    items: [],
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

function matchesTerms(terms: string[], ...values: (string | null | undefined)[]) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Botón tipo chip para elegir una opción entre varias (canal, estado, método). */
function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-[15px] font-semibold transition-colors active:scale-[0.97]",
        selected
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
          : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--ink-2)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="text-base font-semibold text-[var(--foreground)]">{children}</h4>
      {aside}
    </div>
  );
}

export function SaleOrderForm({
  contacts,
  products,
  channels,
  priceTiers,
  bundles,
  categoryScales,
  role,
  onSuccess,
}: SaleOrderFormProps) {
  // react-hook-form muta los arrays del field array; el compilador de React memorizaría
  // cálculos derivados (carrito, totales) con referencias viejas.
  "use no memo";
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [manualPriceIds, setManualPriceIds] = useState<string[]>([]);
  const [editingPriceIds, setEditingPriceIds] = useState<string[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const isAdmin = role === "admin";
  const tiersByProduct = groupTiersByProduct(priceTiers);
  const form = useForm<SaleOrderValues, unknown, SaleOrderOutput>({
    resolver: zodResolver(saleOrderFormSchema),
    defaultValues: getDefaultValues(channels),
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
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  }) ?? "";
  const amountPaid = useWatch({
    control: form.control,
    name: "amountPaid",
  });
  const manualFlags = items.fields.map((field) => isAdmin && manualPriceIds.includes(field.id));
  const linePricing = getLinePricing({
    items: watchedItems as SaleLineValues[],
    manualFlags,
    products,
    bundles,
    categoryScales,
    tiersByProduct,
  });
  const total = roundMoney(linePricing.reduce((sum, line) => sum + line.subtotal, 0));
  const stockIssues = getStockIssues(watchedItems as SaleLineValues[], products, bundles);
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const customerTerms = customerMode === "anonymous" ? [] : toSearchTerms(customerName);
  const suggestedContacts =
    customerTerms.length === 0
      ? sortContactsByRecent(contacts).slice(0, 5)
      : contacts.filter((contact) => matchesTerms(customerTerms, contact.name, contact.phone, contact.email)).slice(0, 5);

  const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean)));
  const pickerTerms = toSearchTerms(pickerQuery);
  const visibleProducts = products.filter(
    (product) =>
      (!pickerCategory || product.category === pickerCategory) &&
      (pickerTerms.length === 0 || matchesTerms(pickerTerms, product.name, product.category)),
  );
  const visibleBundles =
    pickerCategory && pickerCategory !== "__combos"
      ? []
      : bundles.filter((bundle) => pickerTerms.length === 0 || matchesTerms(pickerTerms, bundle.name));
  const showPickerFilters = products.length + bundles.length > PICKER_SEARCH_THRESHOLD;
  const isPartial = paymentStatus === "partial";
  const isCharged = paymentStatus !== "pending";
  const customMethod = paymentMethod && !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod);
  const lineCount = items.fields.length;

  function resetForm() {
    form.reset(getDefaultValues(channels));
    setManualPriceIds([]);
    setEditingPriceIds([]);
    setShowSuggestions(false);
    setShowContactDetails(false);
    setPickerQuery("");
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

  function findLineIndex(kind: "product" | "bundle", id: string) {
    return (watchedItems as SaleLineValues[]).findIndex((item) =>
      kind === "bundle" ? item.bundleId === id : !item.bundleId && item.productId === id,
    );
  }

  function quantityInCart(kind: "product" | "bundle", id: string) {
    const index = findLineIndex(kind, id);
    return index >= 0 ? Number((watchedItems[index] as SaleLineValues).quantity) || 0 : 0;
  }

  function addToCart(kind: "product" | "bundle", id: string) {
    const index = findLineIndex(kind, id);

    if (index >= 0) {
      const current = Number((watchedItems[index] as SaleLineValues).quantity) || 0;
      form.setValue(`items.${index}.quantity`, roundMoney(current + 1), { shouldDirty: true, shouldValidate: true });
      return;
    }

    items.append({
      productId: kind === "product" ? id : "",
      bundleId: kind === "bundle" ? id : "",
      quantity: 1,
      unitPrice: "",
    });
    setFeedback(null);
  }

  function changeQuantity(index: number, delta: number) {
    const current = Number((watchedItems[index] as SaleLineValues).quantity) || 0;
    const next = roundMoney(current + delta);

    if (next <= 0) {
      removeLine(index);
      return;
    }

    form.setValue(`items.${index}.quantity`, next, { shouldDirty: true, shouldValidate: true });
  }

  function removeLine(index: number) {
    const fieldId = items.fields[index]?.id;
    if (fieldId) {
      setManualPrice(fieldId, false);
      setEditingPriceIds((current) => current.filter((entry) => entry !== fieldId));
    }
    items.remove(index);
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
    setShowContactDetails(false);
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
    form.reset(getDefaultValues(channels));
  }, [channels, form, products]);

  useEffect(() => {
    if (paymentStatus === "pending") {
      form.setValue("paymentMethod", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("paidAt", "", { shouldDirty: true, shouldValidate: true });
    } else if (!form.getValues("paidAt")) {
      form.setValue("paidAt", todayISO(), { shouldDirty: true });
    }

    if (paymentStatus !== "partial") {
      form.setValue("amountPaid", "", { shouldDirty: true });
    }
  }, [form, paymentStatus]);

  return (
    <form
      className="grid min-w-0 gap-6 [&>*]:min-w-0"
      onSubmit={form.handleSubmit(
        (values) => {
          if (!canSubmitSale) {
            setFeedback({
              tone: "error",
              message: `Todavía no se puede guardar la venta: falta ${missingDependencies.join(" y ")}.`,
            });
            return;
          }

          const submitPricing = getLinePricing({
            items: values.items,
            manualFlags,
            products,
            bundles,
            categoryScales,
            tiersByProduct,
          });
          const invalidLine = submitPricing.findIndex((line) => !(line.unitPrice > 0));

          if (invalidLine >= 0) {
            setFeedback({
              tone: "error",
              message: `La línea ${invalidLine + 1} no tiene un precio unitario válido.`,
            });
            return;
          }

          const submitStockIssues = getStockIssues(values.items, products, bundles);

          if (submitStockIssues.length > 0) {
            setFeedback({
              tone: "error",
              message: `No alcanza el stock. ${submitStockIssues.join(". ")}.`,
            });
            return;
          }

          if (values.paymentStatus === "partial") {
            const submitTotal = roundMoney(submitPricing.reduce((sum, line) => sum + line.subtotal, 0));
            const amountError = getPartialAmountError(values.amountPaid, submitTotal);

            if (amountError) {
              setFeedback({ tone: "error", message: amountError });
              return;
            }
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
          message={`Para vender primero tiene que existir ${missingDependencies.join(" y ")}.`}
        />
      ) : null}

      {/* 1. Qué se vende */}
      <section className="grid gap-3" aria-labelledby="sale-products-title">
        <SectionTitle aside={<span className="text-[13px] text-[var(--muted)]">Tocá para sumar</span>}>
          <span id="sale-products-title">Productos</span>
        </SectionTitle>

        {showPickerFilters ? (
          <div className="grid gap-2">
            <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
              <input
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Buscar producto o combo"
                aria-label="Buscar producto o combo"
                className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
              />
              {pickerQuery ? (
                <button type="button" aria-label="Borrar búsqueda" onClick={() => setPickerQuery("")} className="p-1 text-[var(--muted)]">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            {categories.length > 1 || bundles.length > 0 ? (
              <div className="chip-row" role="radiogroup" aria-label="Filtrar por categoría">
                <Chip selected={pickerCategory === null} onClick={() => setPickerCategory(null)} className="min-h-9 px-3 text-sm">
                  Todo
                </Chip>
                {categories.map((category) => (
                  <Chip
                    key={category}
                    selected={pickerCategory === category}
                    onClick={() => setPickerCategory(category)}
                    className="min-h-9 px-3 text-sm"
                  >
                    {category}
                  </Chip>
                ))}
                {bundles.length > 0 ? (
                  <Chip selected={pickerCategory === "__combos"} onClick={() => setPickerCategory("__combos")} className="min-h-9 px-3 text-sm">
                    Combos
                  </Chip>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(pickerCategory === "__combos" ? [] : visibleProducts).map((product) => {
            const inCart = quantityInCart("product", product.id);
            const outOfStock = product.currentStock <= 0;
            const lowStock = !outOfStock && product.currentStock <= product.minStock;

            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart("product", product.id)}
                aria-label={`Sumar ${product.name}`}
                className={cn(
                  "relative flex min-h-[104px] flex-col justify-between gap-2 rounded-[14px] border p-3 text-left transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
                  inCart > 0
                    ? "border-[var(--foreground)] bg-[var(--amber-soft)] ring-1 ring-[var(--foreground)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]",
                )}
              >
                {inCart > 0 ? (
                  <span className="absolute top-2 right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--foreground)] px-1.5 text-[13px] font-bold text-white tabular-nums">
                    {formatQuantity(inCart)}
                  </span>
                ) : null}
                <span className={cn("line-clamp-2 text-[15px] font-semibold leading-snug", inCart > 0 && "pr-8")}>
                  {product.name}
                </span>
                <span className="grid gap-0.5">
                  <span className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-none tabular-nums">
                    {formatCurrency(product.salePrice)}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] tabular-nums",
                      outOfStock ? "font-semibold text-[var(--danger)]" : lowStock ? "font-semibold text-[var(--amber-ink)]" : "text-[var(--muted)]",
                    )}
                  >
                    {outOfStock ? "Sin stock" : `${formatQuantity(product.currentStock)} ${product.unit}`}
                  </span>
                </span>
              </button>
            );
          })}
          {visibleBundles.map((bundle) => {
            const inCart = quantityInCart("bundle", bundle.id);

            return (
              <button
                key={bundle.id}
                type="button"
                onClick={() => addToCart("bundle", bundle.id)}
                aria-label={`Sumar combo ${bundle.name}`}
                className={cn(
                  "relative flex min-h-[104px] flex-col justify-between gap-2 rounded-[14px] border border-dashed p-3 text-left transition-colors active:scale-[0.98]",
                  inCart > 0
                    ? "border-[var(--foreground)] bg-[var(--amber-soft)]"
                    : "border-[var(--line-strong)] bg-[var(--surface)]",
                )}
              >
                {inCart > 0 ? (
                  <span className="absolute top-2 right-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--foreground)] px-1.5 text-[13px] font-bold text-white tabular-nums">
                    {formatQuantity(inCart)}
                  </span>
                ) : null}
                <span className={cn("grid gap-0.5", inCart > 0 && "pr-8")}>
                  <span className="text-[12px] font-semibold text-[var(--amber-ink)]">Combo</span>
                  <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{bundle.name}</span>
                </span>
                <span className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-none tabular-nums">
                  {formatCurrency(bundle.salePrice)}
                </span>
              </button>
            );
          })}
        </div>
        {hasProducts && visibleProducts.length === 0 && visibleBundles.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Ningún producto coincide con «{pickerQuery}».</p>
        ) : null}
      </section>

      {/* 2. Lo que lleva */}
      {lineCount > 0 ? (
        <section className="grid gap-2" aria-label="Productos de la venta">
          <SectionTitle aside={<span className="text-[13px] text-[var(--muted)]">{lineCount} {lineCount === 1 ? "línea" : "líneas"}</span>}>
            En esta venta
          </SectionTitle>
          <ul className="divide-y divide-[var(--line)] rounded-[14px] border border-[var(--line)]">
            {items.fields.map((field, index) => {
              const line = linePricing[index];
              const itemErrors = form.formState.errors.items?.[index];
              const unitLabel = line?.bundle ? "combo" : line?.product?.unit ?? "u.";
              const name = line?.bundle ? line.bundle.name : line?.product?.name ?? "Producto";
              const editingPrice = isAdmin && (editingPriceIds.includes(field.id) || line?.isManual);
              const quantity = line?.quantity ?? 0;

              return (
                <li key={field.id} className="grid gap-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">
                        {line?.bundle ? <span className="text-[var(--amber-ink)]">Combo · </span> : null}
                        {line?.scaleMinQty !== null && line?.scaleMinQty !== undefined ? (
                          <span className="text-[var(--amber-ink)]">Promo · </span>
                        ) : null}
                        {name}
                      </p>
                      <p className="text-[13px] text-[var(--muted)] tabular-nums">
                        {formatCurrency(line?.unitPrice ?? 0)} por {unitLabel}
                        {line?.isManual ? " · precio manual" : null}
                        {!line?.isManual && line?.tierMinQty !== null && line?.tierMinQty !== undefined
                          ? ` · precio por cantidad desde ${formatQuantity(line.tierMinQty)}`
                          : null}
                        {!line?.isManual && line?.scaleMinQty !== null && line?.scaleMinQty !== undefined
                          ? ` · promo desde ${formatQuantity(line.scaleMinQty)}`
                          : null}
                      </p>
                    </div>
                    <p className="shrink-0 font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums">
                      {formatCurrency(line?.subtotal ?? 0)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)]">
                      <button
                        type="button"
                        onClick={() => changeQuantity(index, -1)}
                        aria-label={quantity <= 1 ? `Quitar ${name}` : `Restar uno de ${name}`}
                        className="flex h-11 w-11 items-center justify-center text-[var(--ink-2)] active:bg-[var(--surface-2)]"
                      >
                        {quantity <= 1 ? <Trash2 className="h-[18px] w-[18px]" /> : <Minus className="h-5 w-5" />}
                      </button>
                      <Controller
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: itemField }) => (
                          <input
                            name={itemField.name}
                            ref={itemField.ref}
                            value={toInputValue(itemField.value)}
                            onBlur={itemField.onBlur}
                            onChange={(event) => itemField.onChange(toNumberValue(event.target.value))}
                            onFocus={(event) => event.target.select()}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            aria-label={`Cantidad de ${name}`}
                            aria-invalid={itemErrors?.quantity ? true : undefined}
                            className="h-11 w-16 border-x border-[var(--line)] bg-transparent text-center text-base font-semibold tabular-nums"
                          />
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => changeQuantity(index, 1)}
                        aria-label={`Sumar uno de ${name}`}
                        className="flex h-11 w-11 items-center justify-center text-[var(--ink-2)] active:bg-[var(--surface-2)]"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>

                    {isAdmin && !editingPrice ? (
                      <button
                        type="button"
                        className="min-h-11 px-2 text-sm font-semibold text-[var(--ink-2)] underline decoration-[var(--line-strong)] underline-offset-4"
                        onClick={() => setEditingPriceIds((current) => [...current, field.id])}
                      >
                        Cambiar precio
                      </button>
                    ) : null}
                  </div>

                  {editingPrice ? (
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Field label={`Precio por ${unitLabel}`} error={itemErrors?.unitPrice?.message} hint={`Lista: ${formatCurrency(line?.listPrice ?? 0)}`}>
                          <Controller
                            control={form.control}
                            name={`items.${index}.unitPrice`}
                            render={({ field: itemField }) => (
                              <TextInput
                                name={itemField.name}
                                ref={itemField.ref}
                                value={line?.isManual ? toInputValue(itemField.value) : toInputValue(line?.listPrice ?? "")}
                                onBlur={itemField.onBlur}
                                onChange={(event) => {
                                  setManualPrice(field.id, true);
                                  itemField.onChange(toNumberValue(event.target.value));
                                }}
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                              />
                            )}
                          />
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mb-6"
                        onClick={() => {
                          setManualPrice(field.id, false);
                          setEditingPriceIds((current) => current.filter((entry) => entry !== field.id));
                          form.setValue(`items.${index}.unitPrice`, "", { shouldDirty: true });
                        }}
                      >
                        Usar lista
                      </Button>
                    </div>
                  ) : null}

                  {line?.bundle ? (
                    <p className="text-[13px] text-[var(--muted)]">
                      Lleva{" "}
                      {line.bundle.items
                        .map((component) => `${component.productName} × ${formatQuantity(component.quantity * (quantity || 1))}`)
                        .join(", ")}
                    </p>
                  ) : null}
                  {itemErrors?.quantity?.message ? (
                    <p className="text-sm font-medium text-[var(--danger)]">{itemErrors.quantity.message}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {stockIssues.length > 0 ? (
            <ActionNotice tone="warning" message={`No alcanza el stock: ${stockIssues.join("; ")}.`} />
          ) : null}
        </section>
      ) : null}

      {/* 3. Cliente */}
      <section className="grid gap-3" aria-labelledby="sale-customer-title">
        <SectionTitle>
          <span id="sale-customer-title">Cliente</span>
        </SectionTitle>

        {customerMode === "anonymous" ? (
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5">
            <span className="flex items-center gap-2 text-base font-medium">
              <UserRound className="h-4 w-4 text-[var(--muted)]" aria-hidden />
              Sin nombre (consumidor final)
            </span>
            <button type="button" onClick={clearCustomer} className="min-h-11 px-1 text-sm font-semibold text-[var(--ink-2)] underline underline-offset-4">
              Cambiar
            </button>
          </div>
        ) : (
          <div className="relative grid gap-2">
            <Controller
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <TextInput
                  name={field.name}
                  ref={field.ref}
                  value={toInputValue(field.value)}
                  placeholder="Nombre, teléfono o email"
                  aria-label="Cliente"
                  aria-invalid={form.formState.errors.customerName ? true : undefined}
                  autoComplete="off"
                  enterKeyHint="search"
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    field.onBlur();
                    setTimeout(() => setShowSuggestions(false), 150);
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

            {showSuggestions && suggestedContacts.length > 0 && !selectedContact ? (
              <div className="absolute inset-x-0 top-[52px] z-20 overflow-hidden rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_16px_40px_rgba(30,25,21,0.16)]">
                <p className="px-3.5 pt-2.5 pb-1 text-[13px] font-semibold text-[var(--muted)]">
                  {customerTerms.length > 0 ? "Coinciden" : "Últimos clientes"}
                </p>
                {suggestedContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    className="flex min-h-12 w-full flex-col justify-center px-3.5 py-2 text-left hover:bg-[var(--surface-2)] active:bg-[var(--amber-soft)]"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectExistingContact(contact);
                    }}
                  >
                    <span className="truncate text-[15px] font-semibold">{contact.name}</span>
                    {contact.phone || contact.email ? (
                      <span className="truncate text-[13px] text-[var(--muted)]">
                        {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {form.formState.errors.customerName?.message ? (
              <p className="text-sm font-medium text-[var(--danger)]">{form.formState.errors.customerName.message}</p>
            ) : selectedContact ? (
              <p className="text-[13px] text-[var(--moss)]">Cliente existente seleccionado.</p>
            ) : customerTerms.length > 0 ? (
              <p className="text-[13px] text-[var(--muted)]">Si no lo elegís de la lista, se crea como cliente nuevo.</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={useAnonymousCustomer}>
                Sin nombre
              </Button>
              {customerName || selectedContact ? (
                <Button type="button" variant="ghost" onClick={clearCustomer}>
                  Borrar
                </Button>
              ) : null}
              <button
                type="button"
                className="ml-auto flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-[var(--ink-2)]"
                aria-expanded={showContactDetails}
                onClick={() => setShowContactDetails((value) => !value)}
              >
                Teléfono y email
                <ChevronDown className={cn("h-4 w-4 transition-transform", showContactDetails && "rotate-180")} />
              </button>
            </div>

            {showContactDetails ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Teléfono" error={form.formState.errors.customerPhone?.message}>
                  <Controller
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                      <TextInput {...field} value={toInputValue(field.value)} type="tel" inputMode="tel" autoComplete="off" placeholder="381 555 1234" />
                    )}
                  />
                </Field>
                <Field label="Email" error={form.formState.errors.customerEmail?.message}>
                  <Controller
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                      <TextInput {...field} value={toInputValue(field.value)} type="email" inputMode="email" autoComplete="off" placeholder="cliente@ejemplo.com" />
                    )}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* 4. Canal */}
      <section className="grid gap-2" aria-labelledby="sale-channel-title">
        <SectionTitle>
          <span id="sale-channel-title">Canal</span>
        </SectionTitle>
        {hasChannels ? (
          <Controller
            control={form.control}
            name="channelId"
            render={({ field }) => (
              <div className="chip-row" role="radiogroup" aria-labelledby="sale-channel-title">
                {channels.map((channel) => (
                  <Chip key={channel.id} selected={field.value === channel.id} onClick={() => field.onChange(channel.id)}>
                    {channel.name}
                  </Chip>
                ))}
              </div>
            )}
          />
        ) : (
          <p className="text-sm text-[var(--muted)]">No hay canales activos.</p>
        )}
        {form.formState.errors.channelId?.message ? (
          <p className="text-sm font-medium text-[var(--danger)]">{form.formState.errors.channelId.message}</p>
        ) : null}
      </section>

      {/* 5. Cobro */}
      <section className="grid gap-3" aria-labelledby="sale-payment-title">
        <SectionTitle>
          <span id="sale-payment-title">Cobro</span>
        </SectionTitle>
        <Controller
          control={form.control}
          name="paymentStatus"
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-[var(--surface-2)] p-1 ring-1 ring-inset ring-[var(--line)]" role="radiogroup" aria-labelledby="sale-payment-title">
              {PAYMENT_STATUSES.map((status) => {
                const selected = field.value === status.value;
                return (
                  <button
                    key={status.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => field.onChange(status.value)}
                    className={cn(
                      "min-h-11 rounded-[10px] px-1 text-[15px] font-semibold leading-tight transition-colors",
                      selected
                        ? status.value === "paid"
                          ? "bg-[var(--moss)] text-white"
                          : status.value === "partial"
                            ? "bg-[var(--amber)] text-[var(--foreground)]"
                            : "bg-[var(--surface)] text-[var(--foreground)] shadow-[0_1px_2px_rgba(30,25,21,0.15)]"
                        : "text-[var(--muted)]",
                    )}
                  >
                    {status.label}
                  </button>
                );
              })}
            </div>
          )}
        />

        {isCharged ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <span className="text-sm font-semibold text-[var(--ink-2)]" id="sale-method-label">
                Cómo pagó
              </span>
              <div className="chip-row" role="radiogroup" aria-labelledby="sale-method-label">
                {PAYMENT_METHODS.map((method) => (
                  <Chip
                    key={method}
                    selected={paymentMethod === method}
                    onClick={() => form.setValue("paymentMethod", method, { shouldDirty: true, shouldValidate: true })}
                  >
                    {method}
                  </Chip>
                ))}
              </div>
              <Controller
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <TextInput
                    {...field}
                    value={customMethod ? toInputValue(field.value) : ""}
                    onChange={(event) => field.onChange(event.target.value)}
                    placeholder="Otro método"
                    aria-label="Otro método de pago"
                    aria-invalid={form.formState.errors.paymentMethod ? true : undefined}
                  />
                )}
              />
              {form.formState.errors.paymentMethod?.message ? (
                <span className="text-sm font-medium text-[var(--danger)]">{form.formState.errors.paymentMethod.message}</span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isPartial ? (
                <Field
                  label="Cuánto pagó"
                  error={form.formState.errors.amountPaid?.message}
                  hint={`Queda ${formatCurrency(getSaleBalance(total, Number(amountPaid) || 0))}`}
                >
                  <Controller
                    control={form.control}
                    name="amountPaid"
                    render={({ field }) => (
                      <TextInput
                        name={field.name}
                        ref={field.ref}
                        value={toInputValue(field.value)}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        placeholder="$"
                      />
                    )}
                  />
                </Field>
              ) : null}
              <Field label="Fecha de cobro" error={form.formState.errors.paidAt?.message}>
                <Controller
                  control={form.control}
                  name="paidAt"
                  render={({ field }) => <TextInput {...field} value={toInputValue(field.value)} type="date" />}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </section>

      {/* 6. Lo que casi nunca cambia */}
      <details className="group rounded-[14px] border border-[var(--line)] px-3.5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] font-semibold">
          Fecha y notas
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-3 pb-3.5">
          <Field label="Fecha de la venta" error={form.formState.errors.saleDate?.message}>
            <Controller
              control={form.control}
              name="saleDate"
              render={({ field }) => <TextInput {...field} value={toInputValue(field.value)} type="date" />}
            />
          </Field>
          <Field label="Notas" error={form.formState.errors.notes?.message}>
            <Controller
              control={form.control}
              name="notes"
              render={({ field }) => (
                <TextareaInput {...field} value={toInputValue(field.value)} rows={3} placeholder="Ej.: envío a domicilio el jueves" />
              )}
            />
          </Field>
        </div>
      </details>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-[var(--muted)]">
            Total{lineCount > 0 ? ` · ${lineCount} ${lineCount === 1 ? "producto" : "productos"}` : ""}
          </p>
          <p className="font-[family-name:var(--font-heading)] text-[26px] font-bold leading-tight tabular-nums">
            {formatCurrency(total)}
          </p>
        </div>
        <Button type="submit" size="lg" busy={pending} disabled={!canSubmitSale} className="min-w-[150px]">
          Guardar venta
        </Button>
      </div>
    </form>
  );
}
