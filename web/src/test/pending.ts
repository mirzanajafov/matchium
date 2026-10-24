import { act } from "@testing-library/react";
import type { ActionResult } from "@/lib/types";

export function pendingAction<T = void>() {
  let settle: (result: ActionResult<T>) => void = () => undefined;
  const promise = new Promise<ActionResult<T>>((resolve) => {
    settle = resolve;
  });
  onTestFinished(() => act(async () => settle({ ok: false, error: "The test ended first." })));
  return { promise, settle };
}
