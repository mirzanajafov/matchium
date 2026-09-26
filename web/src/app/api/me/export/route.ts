import { ApiError, api } from "@/lib/api";
import { getToken } from "@/lib/session";

export async function GET() {
  const token = await getToken();
  if (!token) return new Response(null, { status: 401 });
  try {
    const data = await api<{ exportedAt: string }>("/me/export", { token });
    const day = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="matchium-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(null, { status: error instanceof ApiError ? error.status : 502 });
  }
}
