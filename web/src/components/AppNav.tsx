"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getInbox } from "@/app/actions";
import type { Inbox } from "@/lib/types";
import { NavLink } from "./NavLink";

const REFRESH_MS = 30_000;

export function AppNav({ initial }: { initial: Inbox }) {
  const pathname = usePathname();
  const [inbox, setInbox] = useState(initial);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      getInbox()
        .then((next) => {
          if (active) setInbox(next);
        })
        .catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <nav className="mt-6 flex gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-medium">
      <NavLink href="/today">Today</NavLink>
      <NavLink href="/matches" badge={inbox.newMatches}>
        Matches
      </NavLink>
      <NavLink href="/chats" badge={inbox.unreadChats}>
        Chats
      </NavLink>
      <NavLink href="/me">You</NavLink>
    </nav>
  );
}
