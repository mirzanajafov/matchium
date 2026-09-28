import type { Metadata } from "next";
import Link from "next/link";
import { MatchCard } from "@/components/MatchCard";
import { authedApi } from "@/lib/api";
import type { Me, TodayMatches } from "@/lib/types";

export const metadata: Metadata = { title: "Matches" };

const MIN_ANSWERS = 6;

export default async function MatchesPage() {
  const [{ matches }, me] = await Promise.all([
    authedApi<TodayMatches>("/matches/today"),
    authedApi<Me>("/me"),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Today&apos;s matches</h1>
      {matches.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-6 text-muted">
          {me.answerCount < MIN_ANSWERS ? (
            <p>
              Nothing yet. Answer {MIN_ANSWERS - me.answerCount} more{" "}
              {MIN_ANSWERS - me.answerCount === 1 ? "question" : "questions"} and you&apos;ll be in tonight&apos;s
              round.{" "}
              <Link href="/today" className="font-medium text-foreground underline">
                Go to today&apos;s questions
              </Link>
            </p>
          ) : (
            <p>
              No match good enough today. We&apos;d rather skip a day than send you a weak one. New ones are picked every
              night.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
      {matches.length > 0 && matches.length < 3 && (
        <p className="mt-4 text-sm text-muted">
          Only {matches.length === 1 ? "one" : "two"} today. We skip pairs that fit poorly instead of filling the slots.
        </p>
      )}
    </>
  );
}
