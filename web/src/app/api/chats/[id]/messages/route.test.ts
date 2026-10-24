import { NextRequest } from "next/server";
import { relayJson } from "@/lib/api";
import { GET } from "./route";

vi.mock("@/lib/api", () => ({ relayJson: vi.fn() }));

function get(url: string) {
  return GET(new NextRequest(url), { params: Promise.resolve({ id: "match-1" }) });
}

describe("GET /api/chats/[id]/messages", () => {
  beforeEach(() => {
    vi.mocked(relayJson).mockReset();
  });

  it("asks the API for the messages after the given time", async () => {
    await get("http://localhost/api/chats/match-1/messages?after=2026-09-23T10:00:00.000Z");
    expect(relayJson).toHaveBeenCalledWith("/chats/match-1/messages?after=2026-09-23T10%3A00%3A00.000Z");
  });

  it("asks for the newest messages without a time", async () => {
    await get("http://localhost/api/chats/match-1/messages");
    expect(relayJson).toHaveBeenCalledWith("/chats/match-1/messages");
  });
});
