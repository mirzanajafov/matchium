import { act } from "@testing-library/react";
import type { ActionResult } from "@/lib/types";

export function pendingAction<T = void>() {
  const { promise, resolve } = Promise.withResolvers<ActionResult<T>>();
  onTestFinished(() => act(async () => resolve({ ok: false, error: "The test ended first." })));
  return { promise, settle: resolve };
}
