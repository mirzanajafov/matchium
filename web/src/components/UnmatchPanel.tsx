"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unmatch } from "@/app/actions";
import type { ReportReason } from "@/lib/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "HARASSMENT", label: "Harassment or threats" },
  { value: "SPAM", label: "Spam or scam" },
  { value: "FAKE_PROFILE", label: "Fake profile" },
  { value: "UNDERAGE", label: "Might be under 18" },
  { value: "OTHER", label: "Something else" },
];

export function UnmatchPanel({ matchId, personName }: { matchId: string; personName: string }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState<ReportReason>("HARASSMENT");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted hover:text-foreground">
        Unmatch or report
      </button>
    );
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await unmatch(matchId, report ? { reason, note: note.trim() || undefined } : undefined);
      } catch {
        setError("That didn't work. Try again.");
        return;
      }
      router.replace("/chats");
      router.refresh();
    });
  }

  return (
    <section aria-label={`Unmatch ${personName}`} className="rounded-2xl border border-line bg-surface p-5 text-sm">
      <p className="font-medium">Unmatch {personName}?</p>
      <p className="mt-1 text-muted">The chat closes for both of you and you won&apos;t be matched again.</p>

      <label className="mt-4 flex items-center gap-2">
        <input type="checkbox" checked={report} onChange={(event) => setReport(event.target.checked)} />
        Also report {personName}
      </label>

      {report && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-muted">What happened?</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
              className="mt-1 h-10 w-full rounded-lg border border-line bg-background px-2"
            >
              {REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-muted">Anything we should know (optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-lg border border-line bg-background p-2"
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-warn">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-10 rounded-lg bg-warn px-4 font-medium text-white disabled:opacity-50"
        >
          {report ? "Unmatch and report" : "Unmatch"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="h-10 px-3 text-muted">
          Cancel
        </button>
      </div>
    </section>
  );
}
