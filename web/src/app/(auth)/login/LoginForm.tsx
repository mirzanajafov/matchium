"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/actions/account";
import { resolveForm } from "@/lib/action-client";
import type { FormState } from "@/lib/types";
import { Field } from "@/components/Field";
import { ErrorMessage } from "@/components/ErrorMessage";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(resolveForm(login), {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <Link href="/forgot-password" className="block text-sm text-muted hover:text-foreground">
        Forgot your password?
      </Link>
      <ErrorMessage message={state.error} />
      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}
