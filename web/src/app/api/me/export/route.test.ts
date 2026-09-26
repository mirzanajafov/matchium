import { ApiError, api } from "@/lib/api";
import { getToken } from "@/lib/session";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({ getToken: vi.fn() }));
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

describe("GET /api/me/export", () => {
  beforeEach(() => {
    vi.mocked(getToken).mockReset();
    vi.mocked(api).mockReset();
  });

  it("refuses without a session", async () => {
    vi.mocked(getToken).mockResolvedValue(undefined);
    expect((await GET()).status).toBe(401);
    expect(api).not.toHaveBeenCalled();
  });

  it("downloads the export as a dated file", async () => {
    vi.mocked(getToken).mockResolvedValue("token");
    vi.mocked(api).mockResolvedValue({ exportedAt: "2026-09-26T10:00:00.000Z", profile: { displayName: "Alice" } });
    const response = await GET();
    expect(api).toHaveBeenCalledWith("/me/export", { token: "token" });
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="matchium-2026-09-26.json"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(await response.text())).toMatchObject({ profile: { displayName: "Alice" } });
  });

  it("passes API failures through", async () => {
    vi.mocked(getToken).mockResolvedValue("token");
    vi.mocked(api).mockRejectedValue(new ApiError(401, "Unauthorized"));
    expect((await GET()).status).toBe(401);
  });
});
