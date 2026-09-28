import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/UnsubscribeForm";

export const metadata: Metadata = { title: "Email settings", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Stop match emails</h1>
      {typeof token === "string" && token ? (
        <UnsubscribeForm token={token} />
      ) : (
        <p className="mt-4 text-muted">This link is missing its token. Use the link from the email.</p>
      )}
    </>
  );
}
