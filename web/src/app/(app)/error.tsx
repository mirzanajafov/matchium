"use client";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">We couldn&apos;t load this</h1>
      <p className="mt-2 text-sm text-muted">
        Something on our side didn&apos;t answer. Your answers and matches are safe.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background"
      >
        Try again
      </button>
    </section>
  );
}
