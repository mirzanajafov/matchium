import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "./types";

export async function resolveAction<T>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await pending;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "Couldn't reach Matchium. Check your connection and try again." };
  }
}
