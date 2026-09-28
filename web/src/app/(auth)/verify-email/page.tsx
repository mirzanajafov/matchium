import type { Metadata } from "next";
import Link from "next/link";
import { ApiError, api } from "@/lib/api";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

async function confirm(token: string | string[] | undefined): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  try {
    await api("/auth/verify-email", { body: { token } });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return false;
    throw error;
  }
}

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const confirmed = await confirm((await searchParams).token);
  return (
    <>
      <h1 className="text-2xl font-semibold">{confirmed ? "Email confirmed" : "That link didn't work"}</h1>
      <p className="mt-4 text-muted">
        {confirmed
          ? "Thanks. We'll only use it for match updates and account emails."
          : "It may have expired. You can send a fresh one from the banner in the app."}
      </p>
      <Link
        href="/today"
        className="mt-6 inline-block rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background"
      >
        Go to today
      </Link>
    </>
  );
}
