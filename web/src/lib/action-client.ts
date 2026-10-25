import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult, FormState } from "./types";

function failureMessage(error: unknown): string {
  unstable_rethrow(error);
  if (unstable_isUnrecognizedActionError(error)) return "Matchium was just updated. Reload the page and try again.";
  return "Couldn't reach Matchium. Check your connection and try again.";
}

export async function resolveAction<T>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await pending;
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

function typedValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of new Set(form.keys())) {
    const texts = form.getAll(name).filter((value) => typeof value === "string");
    if (name !== "password" && texts.length > 0) values[name] = texts.join(",");
  }
  return values;
}

export function resolveForm(action: (state: FormState, form: FormData) => Promise<FormState>) {
  return async (state: FormState, form: FormData): Promise<FormState> => {
    try {
      return await action(state, form);
    } catch (error) {
      return { error: failureMessage(error), values: typedValues(form) };
    }
  };
}

export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(call: () => Promise<ActionResult<T>>, onSuccess?: (value: T) => void, onFailure?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await resolveAction(call());
      if (result.ok) {
        startTransition(() => onSuccess?.(result.value));
      } else {
        onFailure?.();
        startTransition(() => setError(result.error));
      }
    });
  }

  return { pending, error, run };
}
