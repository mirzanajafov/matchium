import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "New password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {typeof token === "string" && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="mt-4 text-muted">
          This link is missing its token.{" "}
          <Link href="/forgot-password" className="font-medium text-foreground underline">
            Ask for a new one
          </Link>
          .
        </p>
      )}
    </>
  );
}
