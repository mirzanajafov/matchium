import { NextRequest } from "next/server";
import { authedFetch } from "@/lib/api";
import { GET } from "./route";

vi.mock("@/lib/api", () => ({ authedFetch: vi.fn() }));

function get() {
  return GET(new NextRequest("http://localhost/api/chats/match-1/stream"), {
    params: Promise.resolve({ id: "match-1" }),
  });
}

describe("GET /api/chats/[id]/stream", () => {
  beforeEach(() => {
    vi.mocked(authedFetch).mockReset();
  });

  it("relays the API's event stream", async () => {
    vi.mocked(authedFetch).mockResolvedValue(new Response("event: ping\ndata: \n\n"));
    const response = await get();
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe("event: ping\ndata: \n\n");
  });

  it.each([
    ["is restarting", () => Promise.resolve(new Response(null, { status: 503 }))],
    ["can't be reached", () => Promise.reject(new TypeError("fetch failed"))],
  ])("asks the browser to come back in a few seconds while the API %s", async (_, upstream) => {
    vi.mocked(authedFetch).mockImplementation(upstream);
    const response = await get();
    expect([response.status, response.headers.get("content-type")]).toEqual([200, "text/event-stream"]);
    expect(await response.text()).toBe("retry: 5000\n\n");
  });

  it.each([401, 403, 404])("passes a %i on so the browser stops reconnecting", async (status) => {
    vi.mocked(authedFetch).mockResolvedValue(new Response(null, { status }));
    expect((await get()).status).toBe(status);
  });
});
