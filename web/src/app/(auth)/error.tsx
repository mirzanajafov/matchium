"use client";

import { RouteError } from "@/components/RouteError";

export default function AuthError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <RouteError
      title="We couldn't load this"
      message="Something on our side didn't answer. Try again in a moment."
      retry={retry}
    />
  );
}
