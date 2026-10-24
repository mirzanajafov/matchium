"use client";

import { useState } from "react";
import { resendVerification } from "@/actions/account";
import { useServerAction } from "@/lib/action-client";

export function VerifyEmailBanner() {
  const [answer, setAnswer] = useState<string | null>(null);
  const { pending, error, run } = useServerAction();

  function resend() {
    run(resendVerification, setAnswer);
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
