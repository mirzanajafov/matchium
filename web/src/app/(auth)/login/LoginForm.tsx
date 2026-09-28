"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Link href="/forgot-password" className="block text-sm text-muted hover:text-foreground">
        Forgot your password?
      </Link>
      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}
