"use client";

import { RouteError } from "@/components/RouteError";

export default function AuthError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <RouteError title="We couldn't reach Matchium" retry={retry}>
      Check your connection and try again in a moment.
    </RouteError>
  );
}
