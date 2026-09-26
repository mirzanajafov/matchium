import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10">
      <Logo />
      <section className="mt-20">
        <h1 className="text-2xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-muted">That page doesn&apos;t exist, or it isn&apos;t yours to see.</p>
        <Link
          href="/today"
          className="mt-6 inline-block rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background"
        >
          Back to today
        </Link>
      </section>
    </main>
  );
}
