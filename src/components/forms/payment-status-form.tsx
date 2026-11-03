"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { updateSalePaymentStatusAction } from "@/actions/sales";
import { PAYMENT_STATUSES } from "@/lib/constants";
import type { AppRole, PaymentStatus, SaleOrderRecord } from "@/lib/domain";
import { getPartialAmountError, getSaleBalance } from "@/lib/finance";
import { paymentStatusUpdateSchema } from "@/lib/validators";
import { formatCurrency, todayISO } from "@/lib/utils";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue, toNumberValue } from "@/components/forms/value-helpers";

type PaymentStatusValues = z.input<typeof paymentStatusUpdateSchema>;
type PaymentStatusOutput = z.output<typeof paymentStatusUpdateSchema>;

type PaymentStatusFormProps = {
  saleOrderId: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  totalAmount: number;
  amountPaid: number;
  role: AppRole;
  onSuccess: (sale: SaleOrderRecord) => void;
};

function getDefaultValues({
  saleOrderId,
  paymentStatus,
  paymentMethod,
  paidAt,
}: Pick<PaymentStatusFormProps, "saleOrderId" | "paymentStatus" | "paymentMethod" | "paidAt">): PaymentStatusValues {
  // Una venta pagada se edita tal cual; si no, la propuesta es registrar un cobro de hoy.
  if (paymentStatus === "paid") {
    return {
      saleOrderId,
      paymentStatus,
      paymentMethod: paymentMethod ?? "",
      paidAt: paidAt ?? "",
      amount: "",
    };
  }

  return {
    saleOrderId,
    paymentStatus: paymentStatus === "pending" ? "paid" : paymentStatus,
    paymentMethod: paymentMethod ?? "",
    paidAt: todayISO(),
    amount: "",
  };
}

export function PaymentStatusForm({
  saleOrderId,
  paymentStatus,
  paymentMethod,
  paidAt,
  totalAmount,
  amountPaid,
  role,
  onSuccess,
}: PaymentStatusFormProps) {
  const isAdmin = role === "admin";
  const balance = getSaleBalance(totalAmount, amountPaid);
  const statusOptions = PAYMENT_STATUSES.filter((status) => isAdmin || status.value !== "pending");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<PaymentStatusValues, unknown, PaymentStatusOutput>({
    resolver: zodResolver(paymentStatusUpdateSchema),
    defaultValues: getDefaultValues({ saleOrderId, paymentStatus, paymentMethod, paidAt }),
  });
  const currentPaymentStatus = useWatch({
    control: form.control,
    name: "paymentStatus",
  });

  useEffect(() => {
    form.reset(getDefaultValues({ saleOrderId, paymentStatus, paymentMethod, paidAt }));
  }, [form, paidAt, paymentMethod, paymentStatus, saleOrderId]);

  useEffect(() => {
    if (currentPaymentStatus === "pending") {
      form.setValue("paymentMethod", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("paidAt", "", { shouldDirty: true, shouldValidate: true });
    }

    if (currentPaymentStatus !== "partial") {
      form.setValue("amount", "", { shouldDirty: true });
    }
  }, [currentPaymentStatus, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          if (values.paymentStatus === "partial") {
            const amountError = getPartialAmountError(values.amount, balance);

            if (amountError) {
              setFeedback({ tone: "error", message: amountError });
              return;
            }
          }

          setFeedback(null);
          startTransition(async () => {
            const result = await updateSalePaymentStatusAction(values);
            if (result.success && result.data) {
              setFeedback({ tone: "success", message: result.message });
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
      <div className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[#f7f5ef] p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Total</p>
          <p className="mt-1 font-semibold">{formatCurrency(totalAmount)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Cobrado</p>
          <p className="mt-1 font-semibold text-[#15553e]">{formatCurrency(amountPaid)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#55755e]">Saldo pendiente</p>
          <p className="mt-1 font-semibold text-[#8c5b17]">{formatCurrency(balance)}</p>
        </div>
      </div>

      <Field label="Estado">
        <Controller
          control={form.control}
          name="paymentStatus"
          render={({ field }) => (
            <SelectInput {...field} value={toInputValue(field.value)}>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </SelectInput>
          )}
        />
      </Field>

      {currentPaymentStatus === "partial" ? (
        <Field
          label="Monto cobrado"
          error={form.formState.errors.amount?.message}
          hint={`Se suma a lo ya cobrado. Debe ser menor al saldo de ${formatCurrency(balance)}.`}
        >
          <Controller
            control={form.control}
            name="amount"
            render={({ field }) => (
              <TextInput
                name={field.name}
                ref={field.ref}
                value={toInputValue(field.value)}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(toNumberValue(event.target.value))}
                type="number"
                min="0.01"
                step="0.01"
              />
            )}
          />
        </Field>
      ) : null}

      {currentPaymentStatus === "paid" && balance > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Se registra un cobro por el saldo de {formatCurrency(balance)} y la venta queda saldada.
        </p>
      ) : null}

      {currentPaymentStatus === "pending" && amountPaid > 0 ? (
        <ActionNotice
          tone="warning"
          message="Volver a pendiente borra todos los cobros registrados de esta venta."
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Método">
          <Controller
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                disabled={currentPaymentStatus === "pending"}
                placeholder="Transferencia"
              />
            )}
          />
        </Field>
        <Field label="Fecha de cobro">
          <Controller
            control={form.control}
            name="paidAt"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                disabled={currentPaymentStatus === "pending"}
                type="date"
              />
            )}
          />
        </Field>
      </div>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="flex justify-end">
        <Button type="submit" busy={pending}>
          Guardar cobro
        </Button>
      </div>
    </form>
  );
}
