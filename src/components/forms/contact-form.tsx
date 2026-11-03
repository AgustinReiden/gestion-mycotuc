"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { saveContactAction } from "@/actions/contacts";
import { CONTACT_TYPES } from "@/lib/constants";
import type { ContactRecord } from "@/lib/domain";
import { contactFormSchema } from "@/lib/validators";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/ui/fields";
import { getFirstFormError, toInputValue } from "@/components/forms/value-helpers";
import type { z } from "zod";

type ContactFormValues = z.input<typeof contactFormSchema>;

type ContactFormProps = {
  contact?: ContactRecord | null;
  onSuccess: (contact: ContactRecord) => void;
};

export function ContactForm({ contact, onSuccess }: ContactFormProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      id: contact?.id,
      type: contact?.type ?? "client",
      name: contact?.name ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      notes: contact?.notes ?? "",
      isActive: contact?.isActive ?? true,
    },
  });

  useEffect(() => {
    form.reset({
      id: contact?.id,
      type: contact?.type ?? "client",
      name: contact?.name ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      notes: contact?.notes ?? "",
      isActive: contact?.isActive ?? true,
    });
  }, [contact, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(
        (values) => {
          setFeedback(null);
          startTransition(async () => {
            const result = await saveContactAction(values);
            if (result.success && result.data) {
              setFeedback({ tone: "success", message: result.message });
              onSuccess(result.data);
              form.reset({
                type: "client",
                name: "",
                phone: "",
                email: "",
                notes: "",
                isActive: true,
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo" error={form.formState.errors.type?.message}>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <SelectInput {...field} value={toInputValue(field.value)}>
                {CONTACT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>

        <Field label="Nombre" error={form.formState.errors.name?.message}>
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <TextInput {...field} value={toInputValue(field.value)} placeholder="María González" />
            )}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Teléfono" error={form.formState.errors.phone?.message}>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                type="tel"
                inputMode="tel"
                placeholder="+54 381..."
              />
            )}
          />
        </Field>

        <Field label="Email" error={form.formState.errors.email?.message}>
          <Controller
            control={form.control}
            name="email"
            render={({ field }) => (
              <TextInput
                {...field}
                value={toInputValue(field.value)}
                type="email"
                inputMode="email"
                placeholder="contacto@ejemplo.com"
              />
            )}
          />
        </Field>
      </div>

      <Field label="Notas" error={form.formState.errors.notes?.message}>
        <Controller
          control={form.control}
          name="notes"
          render={({ field }) => (
            <TextareaInput
              {...field}
              value={toInputValue(field.value)}
              rows={4}
              placeholder="Observaciones, acuerdos o contexto."
            />
          )}
        />
      </Field>

      <label className="flex items-center gap-3 min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[15px]">
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <input
              name={field.name}
              ref={field.ref}
              type="checkbox"
              checked={Boolean(field.value)}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          )}
        />
        Contacto activo
      </label>

      {feedback ? <ActionNotice tone={feedback.tone} message={feedback.message} /> : null}

      <div className="sheet-actions flex items-center justify-end gap-2">
        <Button type="submit" size="lg" busy={pending}>
          {contact ? "Guardar cambios" : "Crear contacto"}
        </Button>
      </div>
    </form>
  );
}
