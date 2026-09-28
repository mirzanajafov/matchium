import { NextRequest } from "next/server";
import { ApiError, api } from "@/lib/api";
import { POST } from "./route";

vi.mock("@/lib/api", async () => {
  class MockApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError: MockApiError, api: vi.fn() };
});

const request = (query: string) => new NextRequest(`http://localhost:3101/api/unsubscribe${query}`, { method: "POST" });

describe("POST /api/unsubscribe", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("handles one-click unsubscribes from mail clients", async () => {
    vi.mocked(api).mockResolvedValue({ unsubscribed: true });
    expect((await POST(request("?token=abc%2Bdef"))).status).toBe(200);
    expect(api).toHaveBeenCalledWith("/email/unsubscribe?token=abc%2Bdef", { method: "POST" });
  });

  it("rejects missing and dead tokens", async () => {
    expect((await POST(request(""))).status).toBe(400);
    vi.mocked(api).mockRejectedValue(new ApiError(400, "This link is not valid"));
    expect((await POST(request("?token=old"))).status).toBe(400);
  });
});
