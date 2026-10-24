"use client";

import { useActionState, useState } from "react";
import { deleteAccount } from "@/actions/account";
import type { FormState } from "@/lib/types";
import { ErrorMessage } from "./ErrorMessage";
import { Field } from "./Field";

export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-warn">
        Delete my account
      </button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm">
        This deletes your profile, answers, matches and messages for good. People you matched with lose the chat too.
      </p>
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <ErrorMessage message={state.error} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-warn px-4 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Deleting..." : "Delete everything"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="h-11 px-3 text-sm text-muted"
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
