"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 rounded-lg py-2 text-center transition-colors ${
        active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
