"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/app/actions";
import { Field } from "@/components/Field";
import { SubmitButton } from "@/components/SubmitButton";

const GENDERS = [
  { value: "WOMAN", label: "Woman", plural: "Women" },
  { value: "MAN", label: "Man", plural: "Men" },
  { value: "NONBINARY", label: "Non-binary", plural: "Non-binary" },
];

function latestAllowedBirthDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

const choice =
  "flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signup, {});
  const values = state.values ?? {};

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={values.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <Field label="First name" name="displayName" autoComplete="given-name" maxLength={40} required defaultValue={values.displayName} />
      <Field
        label="Date of birth"
        name="birthDate"
        type="date"
        max={latestAllowedBirthDate()}
        required
        defaultValue={values.birthDate}
      />
      <Field label="City" name="city" autoComplete="address-level2" maxLength={80} required defaultValue={values.city} />

      <fieldset>
        <legend className="text-sm font-medium">I am</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className={choice}>
              <input
                type="radio"
                name="gender"
                value={g.value}
                required
                defaultChecked={values.gender === g.value}
                className="sr-only"
              />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Interested in</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className={choice}>
              <input
                type="checkbox"
                name="seeking"
                value={g.value}
                defaultChecked={values.seeking?.split(",").includes(g.value)}
                className="sr-only"
              />
              {g.plural}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-warn">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
