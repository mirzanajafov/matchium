import { authedFetch } from "@/lib/api";

export async function GET() {
  const upstream = await authedFetch("/inbox");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
