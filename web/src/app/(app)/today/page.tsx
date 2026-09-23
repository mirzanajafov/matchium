import type { Metadata } from "next";
import { QuestionFlow } from "@/components/QuestionFlow";
import { authedApi } from "@/lib/api";
import type { Me, TodayQuestions } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const [today, me] = await Promise.all([
    authedApi<TodayQuestions>("/questions/today"),
    authedApi<Me>("/me"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Hi {me.displayName}</h1>
      <p className="mt-1 text-muted">
        {today.questions.length === 0
          ? "You've answered every question we have. New ones are on the way."
          : "Today's questions. Answer honestly, there are no wrong answers."}
      </p>
      {today.questions.length > 0 && (
        <div className="mt-6">
          <QuestionFlow questions={today.questions} certainty={me.certainty} />
        </div>
      )}
    </>
  );
}
