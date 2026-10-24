import type { NextRequest } from "next/server";
import { relayJson } from "@/lib/api";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/chats/[id]/messages">) {
  const { id } = await params;
  const after = request.nextUrl.searchParams.get("after");
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  return relayJson(`/chats/${encodeURIComponent(id)}/messages${query}`);
}
