import type { NextRequest } from "next/server";
import { authedFetch } from "@/lib/api";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/chats/[id]/messages">) {
  const { id } = await params;
  const after = request.nextUrl.searchParams.get("after");
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const upstream = await authedFetch(`/chats/${encodeURIComponent(id)}/messages${query}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
