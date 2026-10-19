import { ApiError, api, uploadToApi } from "@/lib/api";
import { login, signup, uploadPhoto } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ setSession: vi.fn() }));
vi.mock("@/lib/api", async () => {
  class MockApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError: MockApiError, api: vi.fn(), uploadToApi: vi.fn() };
});

function form(fields: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("server action errors", () => {
  it("shows the photo limit, not the sign-up message, when the profile is full", async () => {
    vi.mocked(uploadToApi).mockRejectedValue(new ApiError(409, "You can have up to 4 photos"));
    const photo = new File(["jpeg"], "me.jpg", { type: "image/jpeg" });
    expect(await uploadPhoto({}, form({ photo }))).toEqual({ error: "You can have up to 4 photos." });
  });

  it("keeps the sign-in messages for a taken email and a wrong password", async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(409, "This email is already registered"));
    const taken = await signup({}, form({ email: "a@example.com", password: "long enough", seeking: "MAN" }));
    expect(taken.error).toBe("That email already has an account. Try logging in.");

    vi.mocked(api).mockRejectedValueOnce(new ApiError(401, "Invalid email or password"));
    const wrong = await login({}, form({ email: "a@example.com", password: "wrong one" }));
    expect(wrong.error).toBe("Wrong email or password.");
  });
});
