"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { updateSalePaymentStatusAction } from "@/actions/core";
import { PAYMENT_STATUSES } from "@/lib/constants";
import type { PaymentStatus, SaleOrderRecord } from "@/lib/domain";
import { paymentStatusUpdateSchema } from "@/lib/validators";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/fields";
import { toInputValue } from "@/components/forms/value-helpers";

type PaymentStatusValues = z.input<typeof paymentStatusUpdateSchema>;

type PaymentStatusFormProps = {
  saleOrderId: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paidAt: string | null;
  onSuccess: (sale: SaleOrderRecord) => void;
};

export function PaymentStatusForm({
  saleOrderId,
  paymentStatus,
  paymentMethod,
  paidAt,
  onSuccess,
}: PaymentStatusFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const form = useForm<PaymentStatusValues>({
    resolver: zodResolver(paymentStatusUpdateSchema),
    defaultValues: {
      saleOrderId,
      paymentStatus,
      paymentMethod: paymentMethod ?? "",
      paidAt: paidAt ?? "",
    },
  });
  const currentPaymentStatus = useWatch({
    control: form.control,
    name: "paymentStatus",
  });

  useEffect(() => {
    form.reset({
      saleOrderId,
      paymentStatus,
      paymentMethod: paymentMethod ?? "",
      paidAt: paidAt ?? "",
    });
  }, [form, paidAt, paymentMethod, paymentStatus, saleOrderId]);

  useEffect(() => {
    if (currentPaymentStatus === "pending") {
      form.setValue("paymentMethod", "", { shouldDirty: true, shouldValidate: true });
      form.setValue("paidAt", "", { shouldDirty: true, shouldValidate: true });
    }
  }, [currentPaymentStatus, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => {
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
      })}
    >
      <Field label="Estado">
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

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Metodo">
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
