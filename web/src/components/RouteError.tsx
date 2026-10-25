"use client";

import type { ReactNode } from "react";

interface RouteErrorProps {
  title: string;
  children: ReactNode;
  retry: () => void;
}

export function RouteError({ title, children, retry }: RouteErrorProps) {
  return (
    <section role="alert" className="rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{children}</p>
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
