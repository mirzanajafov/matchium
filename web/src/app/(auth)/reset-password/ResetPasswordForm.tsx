"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type FormState, resetPassword } from "@/app/actions";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword.bind(null, token), {});

  if (state.done) {
    return (
      <p role="status" className="mt-6">
        Password changed, and every device was signed out.{" "}
        <Link href="/login" className="font-medium underline">
          Log in with the new one
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending}>Save new password</SubmitButton>
    </form>
  );
}
