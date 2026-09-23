"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { decide } from "@/app/actions";
import { confidenceLabel, dimensionLabel, joinWords, percent } from "@/lib/format";
import type { Match } from "@/lib/types";

export function MatchCard({ match }: { match: Match }) {
  const [decision, setDecision] = useState(match.decision);
  const [mutual, setMutual] = useState(match.mutual);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { person } = match;

  function choose(like: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await decide(match.id, like);
        setDecision(like ? "LIKE" : "PASS");
        setMutual(result.mutual);
      } catch {
        setError("Couldn't save that. Try again.");
      }
    });
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {person.displayName}, {person.age}
          </h2>
          <p className="text-sm text-muted">{person.city}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums">{percent(match.score)}%</p>
          <p className="text-xs text-muted">
            {confidenceLabel(match.confidence)} · {percent(match.confidence)}% sure
          </p>
        </div>
      </header>

      <ul className="mt-5 space-y-2 text-sm">
        <li className="rounded-lg bg-accent-soft px-3 py-2 text-accent-ink">
          You&apos;re on the same page about {joinWords(match.aligned.map(dimensionLabel))}.
        </li>
        <li className="rounded-lg bg-warn-soft px-3 py-2 text-warn">
          You might see {dimensionLabel(match.friction)} differently.
        </li>
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-sm text-warn">
          {error}
        </p>
      )}

      <footer className="mt-5">
        {mutual ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-accent px-3 py-2.5 font-medium text-white dark:text-background">
            <span>It&apos;s mutual. You both said yes.</span>
            <Link href={`/chats/${match.id}`} className="shrink-0 underline">
              Say hi
            </Link>
          </div>
        ) : decision ? (
          <p className="text-center text-sm text-muted">
            {decision === "LIKE" ? "You said yes. We'll let you know if it's mutual." : "You passed on this one."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(false)}
              className="h-11 rounded-lg border border-line font-medium transition-colors hover:border-foreground disabled:opacity-40"
            >
              Pass
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(true)}
              className="h-11 rounded-lg bg-foreground font-medium text-background transition-opacity disabled:opacity-40"
            >
              I&apos;m interested
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
