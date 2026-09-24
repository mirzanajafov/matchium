import type { Metadata } from "next";
import Link from "next/link";
import { QuestionFlow } from "@/components/QuestionFlow";
import { authedApi } from "@/lib/api";
import type { Inbox, Me, TodayQuestions } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const [today, me, inbox] = await Promise.all([
    authedApi<TodayQuestions>("/questions/today"),
    authedApi<Me>("/me"),
    authedApi<Inbox>("/inbox"),
  ]);

  return (
    <>
      {inbox.newMatches > 0 && (
        <Link
          href="/matches"
          className="mb-6 flex items-center justify-between rounded-2xl bg-accent-soft px-5 py-4 text-accent-ink"
        >
          <span className="font-medium">
            {inbox.newMatches === 1 ? "A new match is" : `${inbox.newMatches} new matches are`} waiting for you
          </span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      )}
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
