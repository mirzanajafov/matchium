import type { NextRequest } from "next/server";
import { ApiError, api } from "@/lib/api";

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new Response(null, { status: 400 });
  try {
    await api(`/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
    return new Response(null, { status: 200 });
  } catch (error) {
    return new Response(null, { status: error instanceof ApiError ? error.status : 502 });
  }
}
