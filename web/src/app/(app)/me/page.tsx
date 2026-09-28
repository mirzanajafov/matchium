import type { Metadata } from "next";
import Link from "next/link";
import { logoutEverywhere } from "@/app/actions";
import { BioForm } from "@/components/BioForm";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { EmailDigestToggle } from "@/components/EmailDigestToggle";
import { Meter } from "@/components/Meter";
import { ProfilePhotos } from "@/components/ProfilePhotos";
import { PushToggle } from "@/components/PushToggle";
import { api, authedApi } from "@/lib/api";
import { certaintyHint, longDate, shiftSentence } from "@/lib/format";
import type { Gender, Me } from "@/lib/types";

export const metadata: Metadata = { title: "You" };

const GENDER_LABELS: Record<Gender, string> = { WOMAN: "Woman", MAN: "Man", NONBINARY: "Non-binary" };
const SEEKING_LABELS: Record<Gender, string> = { WOMAN: "women", MAN: "men", NONBINARY: "non-binary people" };

export default async function MePage() {
  const [me, push] = await Promise.all([
    authedApi<Me>("/me"),
    api<{ publicKey: string | null }>("/push/key").catch(() => ({ publicKey: null })),
  ]);
  const rows = [
    ["Email", me.email],
    ["Born", longDate(me.birthDate)],
    ["City", me.city],
    ["Gender", GENDER_LABELS[me.gender]],
    ["Interested in", me.seeking.map((g) => SEEKING_LABELS[g]).join(", ")],
    ["Questions answered", String(me.answerCount)],
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">{me.displayName}</h1>
      {me.role === "ADMIN" && (
        <Link href="/admin" className="mt-2 inline-block text-sm font-medium text-accent-ink hover:underline">
          Moderation queue
        </Link>
      )}
      <section className="mt-6 space-y-6 rounded-2xl border border-line bg-surface p-6">
        <ProfilePhotos photos={me.photos} />
        <BioForm bio={me.bio} />
      </section>
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
      <section className="mt-6 space-y-6 rounded-2xl border border-line bg-surface p-6">
        {push.publicKey && <PushToggle publicKey={push.publicKey} />}
        <EmailDigestToggle enabled={me.emailDigest} />
      </section>
      <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-6 py-3 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-sm font-medium">Your data</h2>
        <a href="/api/me/export" download className="block text-sm font-medium text-accent-ink hover:underline">
          Download everything we have on you (JSON)
        </a>
        <form action={logoutEverywhere}>
          <button type="submit" className="text-sm font-medium text-muted hover:text-foreground">
            Sign out of all devices
          </button>
        </form>
        <DeleteAccountForm />
      </section>
    </>
  );
}
