"use client";

import { useActionState } from "react";
import { confirmSignup } from "@/actions/account";
import type { FormState } from "@/lib/types";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function ConfirmSignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmSignup.bind(null, token), {});

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Password" name="password" type="password" autoComplete="current-password" minLength={8} required />
      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending}>Finish signing up</SubmitButton>
    </form>
  );
}
