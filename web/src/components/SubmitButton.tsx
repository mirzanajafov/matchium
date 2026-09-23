import type { ReactNode } from "react";

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-lg bg-foreground font-medium text-background transition-opacity disabled:opacity-40"
    >
      {pending ? "One sec..." : children}
    </button>
  );
}
