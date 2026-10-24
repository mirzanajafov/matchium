"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "@/actions/account";

export function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resend() {
    setError(null);
    startTransition(async () => {
      const result = await resendVerification();
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  return (
    <aside
      className="mt-4 rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm"
      aria-label="Confirm your email"
    >
      <p>
        Confirm your email so we can reach you when push is off.{" "}
        {sent ? (
          <span role="status">Sent. Check your inbox.</span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={resend}
            className="font-medium underline disabled:opacity-50"
          >
            Send the link again
          </button>
        )}
      </p>
      {error && (
        <p role="alert" className="mt-1 font-medium">
          {error}
        </p>
      )}
    </aside>
  );
}
