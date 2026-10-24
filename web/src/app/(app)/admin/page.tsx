import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportCard } from "@/components/ReportCard";
import { authedApi } from "@/lib/api";
import type { AdminReport, Me } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const me = await authedApi<Me>("/me");
  if (me.role !== "ADMIN") notFound();
  const status = (await searchParams).status === "reviewed" ? "reviewed" : "open";
  const reports = await authedApi<AdminReport[]>(`/admin/reports?status=${status}`);

  return (
    <>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <nav className="mt-4 flex gap-4 text-sm" aria-label="Report status">
        {(["open", "reviewed"] as const).map((tab) => (
          <Link
            key={tab}
            href={tab === "open" ? "/admin" : "/admin?status=reviewed"}
            aria-current={tab === status ? "page" : undefined}
            className={tab === status ? "font-semibold" : "text-muted hover:text-foreground"}
          >
            {tab === "open" ? "Waiting" : "Reviewed"}
          </Link>
        ))}
      </nav>
      <div className="mt-6 space-y-4">
        {reports.length === 0 ? (
          <p className="text-muted">{status === "open" ? "Nothing waiting. Good." : "Nothing reviewed yet."}</p>
        ) : (
          reports.map((report) => <ReportCard key={report.id} report={report} />)
        )}
      </div>
    </>
  );
}
