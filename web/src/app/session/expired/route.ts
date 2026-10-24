import { clearSession } from "@/lib/session";

export async function GET() {
  await clearSession();
  return new Response(null, { status: 307, headers: { location: "/login" } });
}
