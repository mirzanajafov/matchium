import { NextRequest } from "next/server";
import { authedFetch } from "@/lib/api";
import { GET } from "./route";

vi.mock("@/lib/api", () => ({ authedFetch: vi.fn() }));

function get(url: string) {
  return GET(new NextRequest(url), { params: Promise.resolve({ id: "match-1" }) });
}

describe("GET /api/chats/[id]/messages", () => {
  beforeEach(() => {
    vi.mocked(authedFetch).mockReset();
  });

  it("asks the API for the messages after the given time and passes its answer on", async () => {
    vi.mocked(authedFetch).mockResolvedValue(Response.json({ messages: [] }));
    const response = await get("http://localhost/api/chats/match-1/messages?after=2026-09-23T10:00:00.000Z");

    expect(authedFetch).toHaveBeenCalledWith("/chats/match-1/messages?after=2026-09-23T10%3A00%3A00.000Z");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: [] });
  });

  it("passes a refusal on with its status", async () => {
    vi.mocked(authedFetch).mockResolvedValue(new Response(null, { status: 401 }));
    expect((await get("http://localhost/api/chats/match-1/messages")).status).toBe(401);
    expect(authedFetch).toHaveBeenCalledWith("/chats/match-1/messages");
  });
});
