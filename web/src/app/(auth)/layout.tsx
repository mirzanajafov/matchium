import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 py-10">
      <Logo />
      <div className="mt-12">{children}</div>
    </main>
  );
}
