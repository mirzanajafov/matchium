import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { AppNav } from "@/components/AppNav";
import { Logo } from "@/components/Logo";
import { authedApi } from "@/lib/api";
import type { Inbox } from "@/lib/types";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const inbox = await authedApi<Inbox>("/inbox");

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
      <AppNav initial={inbox} />
      <main className="mt-8 flex-1">{children}</main>
    </div>
  );
}
