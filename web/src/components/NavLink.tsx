"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  badge?: number;
  children: string;
}

export function NavLink({ href, badge = 0, children }: NavLinkProps) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${children}, ${badge} new` : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition-colors ${
        active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
      {badge > 0 && (
        <span
          aria-hidden="true"
          className="min-w-5 rounded-full bg-accent px-1.5 text-xs leading-5 text-white dark:text-background"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
