import type { NextRequest } from "next/server";
import { openApiImage } from "@/lib/api";

export async function GET(_: NextRequest, { params }: RouteContext<"/api/photos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const upstream = await openApiImage(`/photos/${id}`);
  if (!upstream.ok || !upstream.body) return new Response(null, { status: upstream.status === 401 ? 401 : 404 });
  return new Response(upstream.body, {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=3600" },
  });
}
