"use client";

import { useId, useOptimistic } from "react";
import { setEmailDigest } from "@/actions/profile";
import { useServerAction } from "@/lib/action-client";
import { ErrorMessage } from "./ErrorMessage";
import { Switch } from "./Switch";

export function EmailDigestToggle({ enabled }: { enabled: boolean }) {
  const [shown, setShown] = useOptimistic(enabled);
  const { pending, error, run } = useServerAction();
  const errorId = useId();

  function toggle() {
    run(() => {
      setShown(!shown);
      return setEmailDigest(!shown);
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium">Email</h2>
        <p className="mt-1 text-sm text-muted">
          When push is off on all your devices, we email you once when your matches are ready.
        </p>
        <ErrorMessage message={error} id={errorId} className="mt-2" />
      </div>
      <Switch
        checked={shown}
        label="Match emails"
        describedBy={error ? errorId : undefined}
        disabled={pending}
        onToggle={toggle}
      />
    </div>
  );
}
