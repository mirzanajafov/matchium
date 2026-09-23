"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { answerQuestion } from "@/app/actions";
import { certaintyHint } from "@/lib/format";
import type { AnswerValues, DailyQuestion } from "@/lib/types";
import { Meter } from "./Meter";
import { Scale } from "./Scale";

interface QuestionFlowProps {
  questions: DailyQuestion[];
  certainty: number;
}

type Draft = { [K in keyof AnswerValues]: number | null };

const EMPTY: Draft = { self: null, partner: null, importance: null };

export function QuestionFlow({ questions, certainty: initialCertainty }: QuestionFlowProps) {
  const [open, setOpen] = useState(() => questions.filter((q) => !q.answered));
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [certainty, setCertainty] = useState(initialCertainty);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = questions.length;
  const current = open[0];

  if (!current) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold">That&apos;s it for today</h2>
        <p className="mt-1 text-muted">
          New matches are picked overnight. Come back tomorrow for a few more questions.
        </p>
        <div className="mt-6">
          <Meter value={certainty} label="How well we know you" caption={certaintyHint(certainty)} />
        </div>
        <Link href="/matches" className="mt-6 inline-block text-sm font-medium text-accent-ink underline">
          See today&apos;s matches
        </Link>
      </section>
    );
  }

  const complete = draft.self !== null && draft.partner !== null && draft.importance !== null;
  const set = (key: keyof AnswerValues) => (value: number) => setDraft((d) => ({ ...d, [key]: value }));

  function submit() {
    if (!complete) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await answerQuestion(current.id, draft as AnswerValues);
        setCertainty(result.certainty);
        setOpen((rest) => rest.slice(1));
        setDraft(EMPTY);
      } catch {
        setError("Couldn't save that answer. Try again in a moment.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <p className="text-sm text-muted">
        Question {total - open.length + 1} of {total}
      </p>
      <h2 className="mt-2 text-xl font-semibold leading-snug">{current.text}</h2>

      <form
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Scale
          name="self"
          label="How true is this for you?"
          low="Not at all"
          high="Completely"
          value={draft.self}
          onChange={set("self")}
        />
        <Scale
          name="partner"
          label="How would you want your partner to answer?"
          low="Not at all"
          high="Completely"
          value={draft.partner}
          onChange={set("partner")}
        />
        <Scale
          name="importance"
          label="How much does this matter to you?"
          low="Doesn't matter"
          high="Deal-breaker"
          value={draft.importance}
          onChange={set("importance")}
        />

        {error && (
          <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!complete || pending}
          className="h-11 w-full rounded-lg bg-foreground font-medium text-background transition-opacity disabled:opacity-40"
        >
          {pending ? "Saving..." : open.length === 1 ? "Finish for today" : "Next"}
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-4">
        <Meter value={certainty} label="How well we know you" />
      </div>
    </section>
  );
}
