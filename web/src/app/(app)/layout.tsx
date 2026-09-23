import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Logo href="/today" />
        <form action={logout}>
          <button type="submit" className="text-sm text-muted hover:text-foreground">
            Log out
          </button>
        </form>
      </header>
      <nav className="mt-6 flex gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-medium">
        <NavLink href="/today">Today</NavLink>
        <NavLink href="/matches">Matches</NavLink>
        <NavLink href="/me">You</NavLink>
      </nav>
      <main className="mt-8 flex-1">{children}</main>
    </div>
  );
}
