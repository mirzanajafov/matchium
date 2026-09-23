import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="12" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="20" cy="16" r="9" fill="none" stroke="var(--accent)" strokeWidth="3" />
      </svg>
      Matchium
    </Link>
  );
}
