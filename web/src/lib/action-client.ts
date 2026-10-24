import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "./types";

export async function resolveAction<T>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await pending;
  } catch (error) {
    unstable_rethrow(error);
    if (unstable_isUnrecognizedActionError(error)) {
      return { ok: false, error: "Matchium was just updated. Reload the page and try again." };
    }
    return { ok: false, error: "Couldn't reach Matchium. Check your connection and try again." };
  }
}

export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T>(call: () => Promise<ActionResult<T>>, onSuccess?: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      const result = await resolveAction(call());
      startTransition(() => {
        if (result.ok) onSuccess?.(result.value);
        else setError(result.error);
      });
    });
  }

  return { pending, error, run };
}
