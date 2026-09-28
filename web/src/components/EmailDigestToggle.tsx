"use client";

import { useOptimistic, useTransition } from "react";
import { setEmailDigest } from "@/app/actions";

export function EmailDigestToggle({ enabled }: { enabled: boolean }) {
  const [shown, setShown] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium">Email</h2>
        <p className="mt-1 text-sm text-muted">
          When push is off on all your devices, we email you once when your matches are ready.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-label="Match emails"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setShown(!shown);
            await setEmailDigest(!shown);
          })
        }
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          shown ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            shown ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
