import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="mt-2 text-sm text-muted">We&apos;ll email you a link to choose a new one.</p>
      <ForgotPasswordForm />
      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="font-medium text-foreground underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
