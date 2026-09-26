import type { Metadata } from "next";
import { Meter } from "@/components/Meter";
import { authedApi } from "@/lib/api";
import { certaintyHint, shiftSentence } from "@/lib/format";
import type { Gender, Me } from "@/lib/types";

export const metadata: Metadata = { title: "You" };

const GENDER_LABELS: Record<Gender, string> = { WOMAN: "Woman", MAN: "Man", NONBINARY: "Non-binary" };
const SEEKING_LABELS: Record<Gender, string> = { WOMAN: "women", MAN: "men", NONBINARY: "non-binary people" };

export default async function MePage() {
  const me = await authedApi<Me>("/me");
  const rows = [
    ["Email", me.email],
    ["Born", me.birthDate],
    ["City", me.city],
    ["Gender", GENDER_LABELS[me.gender]],
    ["Interested in", me.seeking.map((g) => SEEKING_LABELS[g]).join(", ")],
    ["Questions answered", String(me.answerCount)],
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{me.displayName}</h1>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
        <Meter value={me.certainty} label="How well we know you" caption={certaintyHint(me.certainty)} />
      </section>
      {me.decisionsLearned > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-medium">What your likes say</h2>
          <p className="mt-1 text-sm text-muted">
            Learned from {me.decisionsLearned} {me.decisionsLearned === 1 ? "decision" : "decisions"}.
          </p>
          {me.preferenceShifts.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {me.preferenceShifts.map((shift) => (
                <li key={shift.dimension}>{shiftSentence(shift)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm">So far your likes line up with what you told us.</p>
          )}
        </section>
      )}
      <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-6 py-3 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
