import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/types";

export type Refusals = Partial<Record<number, string>>;

function sentence(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1) + ".";
}

export async function attempt<T>(
  call: () => Promise<T>,
  fallback: string,
  refusals: Refusals = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status < 500) {
      return { ok: false, error: refusals[error.status] ?? sentence(error.message) };
    }
    console.error(error);
    return { ok: false, error: fallback };
  }
}
