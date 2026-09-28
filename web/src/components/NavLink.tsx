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
      className={`flex flex-1 items-center justify-center rounded-lg py-2 transition-colors ${
        active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
      }`}
    >
      <span className="relative">
        {children}
        {badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-2 left-full ml-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-white dark:text-background"
          >
            {badge}
          </span>
        )}
      </span>
    </Link>
  );
}
