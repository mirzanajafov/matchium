"use client";

import { useActionState, useState } from "react";
import { signup } from "@/actions/account";
import { GENDERS } from "@/lib/labels";
import type { FormState } from "@/lib/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

function latestAllowedBirthDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

const choice =
  "flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  const [dismissed, setDismissed] = useState<FormState>();
  const values = state.values ?? {};

  if (state.done && state !== dismissed) {
    return (
      <div className="mt-6 space-y-3">
        <p role="status">
          Check your inbox at {values.email}. Open the link we sent and enter your password to finish signing up.
        </p>
        <button type="button" onClick={() => setDismissed(state)} className="text-sm font-medium underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={values.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <Field
        label="First name"
        name="displayName"
        autoComplete="given-name"
        maxLength={40}
        required
        defaultValue={values.displayName}
      />
      <Field
        label="Date of birth"
        name="birthDate"
        type="date"
        max={latestAllowedBirthDate()}
        required
        defaultValue={values.birthDate}
      />
      <Field
        label="City"
        name="city"
        autoComplete="address-level2"
        maxLength={80}
        required
        defaultValue={values.city}
      />

      <fieldset>
        <legend className="text-sm font-medium">I am</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {Object.entries(GENDERS).map(([value, { label }]) => (
            <label key={value} className={choice}>
              <input
                type="radio"
                name="gender"
                value={value}
                required
                defaultChecked={values.gender === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Interested in</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {Object.entries(GENDERS).map(([value, { plural }]) => (
            <label key={value} className={choice}>
              <input
                type="checkbox"
                name="seeking"
                value={value}
                defaultChecked={values.seeking?.split(",").includes(value)}
                className="sr-only"
              />
              {plural}
            </label>
          ))}
        </div>
      </fieldset>

      <ErrorMessage message={state.error} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
