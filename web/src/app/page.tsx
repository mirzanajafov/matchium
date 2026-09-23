import Link from "next/link";
import { Logo } from "@/components/Logo";

const STEPS = [
  {
    title: "Answer a few questions a day",
    body: "Each one takes a few seconds: how true it is for you, what you'd want from a partner, and how much it matters.",
  },
  {
    title: "Get a few matches every morning",
    body: "Picked overnight from people whose answers fit yours, and who you fit back.",
  },
  {
    title: "See why",
    body: "Every match comes with what you have in common, where you might clash, and how sure we are.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-sm font-medium text-muted hover:text-foreground">
          Log in
        </Link>
      </header>

      <section className="mt-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Dating that shows its work.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted">
          Matchium gets to know you a little more every day and gives you a handful of matches, each with a
          plain reason and an honest confidence level.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-flex h-12 items-center rounded-lg bg-foreground px-6 font-medium text-background"
        >
          Get started
        </Link>
      </section>

      <ol className="mt-20 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="font-mono text-sm text-accent">0{index + 1}</span>
            <h2 className="mt-1 font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
