"use client";

import { useActionState } from "react";
import { type FormState, requestPasswordReset } from "@/app/actions";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, {});

  if (state.done) {
    return (
      <p role="status" className="mt-6">
        If there&apos;s an account for {state.values?.email}, a link to reset the password is on its way. It works for 30
        minutes.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending}>Send me a link</SubmitButton>
    </form>
  );
}
