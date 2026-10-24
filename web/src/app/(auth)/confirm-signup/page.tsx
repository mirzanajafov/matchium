import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmSignupForm } from "./ConfirmSignupForm";

export const metadata: Metadata = { title: "Finish signing up", robots: { index: false } };

export default async function ConfirmSignupPage({ searchParams }: PageProps<"/confirm-signup">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Finish signing up</h1>
      {typeof token === "string" && token ? (
        <>
          <p className="mt-4 text-muted">Enter the password you chose when you signed up.</p>
          <ConfirmSignupForm token={token} />
        </>
      ) : (
        <p className="mt-4 text-muted">
          This link is missing its token.{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Sign up again
          </Link>
          .
        </p>
      )}
    </>
  );
}
