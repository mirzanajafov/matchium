import type { NextRequest } from "next/server";
import { openApiStream } from "@/lib/api";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/chats/[id]/stream">) {
  const { id } = await params;
  const upstream = await openApiStream(`/chats/${encodeURIComponent(id)}/stream`, request.signal);
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status });

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
