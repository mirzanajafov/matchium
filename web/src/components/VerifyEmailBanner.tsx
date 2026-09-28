"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "@/app/actions";

export function VerifyEmailBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <aside className="mt-4 rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm" aria-label="Confirm your email">
      <p>
        Confirm your email so we can reach you when push is off.{" "}
        {message ? (
          <span role="status">{message}</span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await resendVerification();
                setMessage(result.sent ? "Sent. Check your inbox." : (result.error ?? "Try again later."));
              })
            }
            className="font-medium underline disabled:opacity-50"
          >
            Send the link again
          </button>
        )}
      </p>
    </aside>
  );
}
