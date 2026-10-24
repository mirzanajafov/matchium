"use server";

import { authedApi } from "@/lib/api";
import type { ActionResult, AnswerResult, AnswerValues } from "@/lib/types";
import { attempt } from "./attempt";

export async function answerQuestion(questionId: string, values: AnswerValues): Promise<ActionResult<AnswerResult>> {
  return attempt(
    () => authedApi<AnswerResult>(`/questions/${encodeURIComponent(questionId)}/answer`, { body: values }),
    "Couldn't save that answer. Try again in a moment.",
  );
}
