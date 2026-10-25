"use client";

import { useActionState, useState } from "react";
import { saveBio } from "@/actions/profile";
import { resolveForm } from "@/lib/action-client";
import type { FormState } from "@/lib/types";

const MAX_BIO = 300;

export function BioForm({ bio }: { bio: string }) {
  const [state, action, saving] = useActionState<FormState, FormData>(resolveForm(saveBio), {});
  const [text, setText] = useState(bio);
  const saved = state.done ? (state.values?.bio ?? bio) : bio;
  const dirty = text.trim() !== saved.trim();

  return (
    <form action={action}>
      <label htmlFor="bio" className="text-sm font-medium">
        About you
      </label>
      <textarea
        id="bio"
        name="bio"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_BIO}
        rows={3}
        placeholder="A line or two your matches will see."
        className="mt-2 w-full rounded-lg border border-line bg-background p-3 text-sm"
      />
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted" aria-live="polite">
          {state.error ?? (state.done && !dirty ? "Saved." : `${MAX_BIO - text.length} left`)}
        </span>
        <button
          type="submit"
          disabled={saving || !dirty}
          className="h-9 rounded-lg bg-foreground px-4 font-medium text-background disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
