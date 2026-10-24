import { ApiError, api, authedApi } from "@/lib/api";
import { unsubscribeEmail, uploadPhoto } from "./profile";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
  authedApi: vi.fn(),
}));

describe("profile actions", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(authedApi).mockReset();
  });

  it("shows the photo limit, not the sign-up message, when the profile is full", async () => {
    vi.mocked(authedApi).mockRejectedValue(new ApiError(409, "You can have up to 4 photos"));
    const form = new FormData();
    form.set("photo", new File(["jpeg"], "me.jpg", { type: "image/jpeg" }));
    expect(await uploadPhoto({}, form)).toEqual({ error: "You can have up to 4 photos." });
  });

  it("says an unsubscribe link the API says is gone doesn't work anymore", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(410, "This link is not valid"));
    expect(await unsubscribeEmail("old-token")).toEqual({ ok: false, error: "This link doesn't work anymore." });
  });
});
