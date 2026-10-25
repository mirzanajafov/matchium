"use client";

import { RouteError } from "@/components/RouteError";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <RouteError
      title="We couldn't load this"
      message="Something on our side didn't answer. Your answers and matches are safe."
      retry={retry}
    />
  );
}
