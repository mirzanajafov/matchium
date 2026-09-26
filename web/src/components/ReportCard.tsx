import { resolveReport } from "@/app/actions";
import type { AdminReport, ReportReason } from "@/lib/types";

const REASONS: Record<ReportReason, string> = {
  SPAM: "Spam or scam",
  HARASSMENT: "Harassment",
  FAKE_PROFILE: "Fake profile",
  UNDERAGE: "Possibly under 18",
  OTHER: "Other",
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function ReportCard({ report }: { report: AdminReport }) {
  const { reporter, reported } = report;
  return (
    <article className="rounded-2xl border border-line bg-surface p-5 text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{REASONS[report.reason]}</h2>
        <time dateTime={report.createdAt} className="text-muted">
          {when.format(new Date(report.createdAt))} UTC
        </time>
      </header>
      <p className="mt-2">
        <span className="font-medium">{reporter.displayName}</span> reported{" "}
        <span className="font-medium">{reported.displayName}</span> ({reported.email})
        {reported.reportsAgainst > 1 && (
          <span className="ml-1 rounded-full bg-warn-soft px-2 text-warn">{reported.reportsAgainst} reports</span>
        )}
        {reported.banned && <span className="ml-1 rounded-full bg-line px-2">banned</span>}
      </p>
      {report.note && <blockquote className="mt-2 border-l-2 border-line pl-3 text-muted">{report.note}</blockquote>}

      <details className="mt-3">
        <summary className="cursor-pointer text-muted">
          Conversation ({report.messages.length} {report.messages.length === 1 ? "message" : "messages"})
        </summary>
        <ol className="mt-2 space-y-1">
          {report.messages.map((message) => (
            <li key={message.sentAt + message.body}>
              <span className="font-medium">
                {message.from === "reported" ? reported.displayName : reporter.displayName}:
              </span>{" "}
              {message.body}
            </li>
          ))}
        </ol>
      </details>

      {report.reviewedAt ? (
        <p className="mt-4 text-muted">
          {report.outcome === "BANNED" ? "Banned" : "Dismissed"} on {when.format(new Date(report.reviewedAt))} UTC
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={resolveReport.bind(null, report.id, "DISMISSED")}>
            <button type="submit" className="h-10 rounded-lg border border-line px-4 font-medium">
              Dismiss
            </button>
          </form>
          <form action={resolveReport.bind(null, report.id, "BANNED")} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" required />
              I read the conversation
            </label>
            <button type="submit" className="h-10 rounded-lg bg-warn px-4 font-medium text-white">
              Ban {reported.displayName}
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
