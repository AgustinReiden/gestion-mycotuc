"use client";

import { useState, useTransition } from "react";
import { loginAction } from "@/actions/auth";
import { ActionNotice } from "@/components/forms/action-notice";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/fields";

type LoginFormProps = {
  notice?: string | null;
};

export function LoginForm({ notice = null }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setFeedback(null);

        startTransition(async () => {
          const result = await loginAction({ email, password });
          if (!result?.success) {
            setFeedback(result.error ?? result.message);
          }
        });
      }}
    >
      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@mycotuc.com"
          autoComplete="email"
        />
      </Field>

      <Field label="Contrasena">
        <TextInput
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Tu contrasena"
          autoComplete="current-password"
        />
      </Field>

      {notice ? <ActionNotice tone="warning" message={notice} /> : null}

      {feedback ? (
        <div className="rounded-2xl border border-[#ebc7bf] bg-[#fff1ed] px-4 py-3 text-sm text-[#9a4635]">
          {feedback}
        </div>
      ) : null}

      <Button type="submit" className="w-full" busy={pending}>
        Entrar al sistema
      </Button>
    </form>
  );
}
