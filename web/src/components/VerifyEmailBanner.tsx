"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "@/actions/account";
import { resolveAction } from "@/lib/action-client";

export function VerifyEmailBanner() {
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resend() {
    setError(null);
    startTransition(async () => {
      const resent = await resolveAction(resendVerification());
      if (resent.ok) setAnswer(resent.value);
      else setError(resent.error);
    });
  }

  return (
    <aside
      className="mt-4 rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm"
      aria-label="Confirm your email"
    >
      <p>
        Confirm your email so we can reach you when push is off.{" "}
        {answer ? (
          <span role="status">{answer}</span>
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
