import type { NextRequest } from "next/server";
import { authedFetch } from "@/lib/api";

const RETRY_MS = 5000;

function eventStream(body: BodyInit) {
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function unreachable(error: unknown): null {
  if (error instanceof TypeError) return null;
  throw error;
}

export async function GET(request: NextRequest, { params }: RouteContext<"/api/chats/[id]/stream">) {
  const { id } = await params;
  const upstream = await authedFetch(`/chats/${encodeURIComponent(id)}/stream`, {
    accept: "text/event-stream",
    signal: request.signal,
  }).catch(unreachable);
  if (!upstream || upstream.status === 503) return eventStream(`retry: ${RETRY_MS}\n\n`);
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status });

  return eventStream(upstream.body);
}
