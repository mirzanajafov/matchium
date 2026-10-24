"use server";

import { authedApi } from "@/lib/api";
import type { ActionResult, ReportReason } from "@/lib/types";
import { attempt } from "./attempt";

export async function decide(matchId: string, like: boolean): Promise<ActionResult<{ mutual: boolean }>> {
  return attempt(
    () => authedApi<{ mutual: boolean }>(`/matches/${encodeURIComponent(matchId)}/decision`, { body: { like } }),
    "Couldn't save that. Try again.",
  );
}

export async function unmatch(
  matchId: string,
  report?: { reason: ReportReason; note?: string },
): Promise<ActionResult> {
  return attempt(
    () => authedApi(`/matches/${encodeURIComponent(matchId)}/unmatch`, { body: report ? { report } : {} }),
    "That didn't work. Try again.",
  );
}
