import { ApiError, api, uploadToApi } from "@/lib/api";
import { login, requestPasswordReset, resetPassword, signup, uploadPhoto } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ setSession: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
  uploadToApi: vi.fn(),
}));

function form(fields: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("server action errors", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(uploadToApi).mockReset();
  });

  it("shows the photo limit, not the sign-up message, when the profile is full", async () => {
    vi.mocked(uploadToApi).mockRejectedValue(new ApiError(409, "You can have up to 4 photos"));
    const photo = new File(["jpeg"], "me.jpg", { type: "image/jpeg" });
    expect(await uploadPhoto({}, form({ photo }))).toEqual({ error: "You can have up to 4 photos." });
  });

  it("passes the API's reason on when a reset request is refused", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(429, "Too many attempts, try again in 5 minutes"));
    const refused = await requestPasswordReset({}, form({ email: "a@example.com" }));
    expect(refused.error).toBe("Too many attempts, try again in 5 minutes.");
  });

  it("tells sign-up that the email already has an account", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, "This email is already registered"));
    const taken = await signup({}, form({ email: "a@example.com", password: "long enough", seeking: "MAN" }));
    expect(taken.error).toBe("That email already has an account. Try logging in.");
  });

  it("tells login that the email or password is wrong", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(401, "Invalid email or password"));
    const wrong = await login({}, form({ email: "a@example.com", password: "wrong one" }));
    expect(wrong.error).toBe("Wrong email or password.");
  });

  it("tells reset that a long password is too long instead of calling the link expired", async () => {
    const refused = await resetPassword("token", {}, form({ password: "x".repeat(129) }));
    expect(refused.error).toBe("Use at most 128 characters.");
    expect(api).not.toHaveBeenCalled();
  });

  it("calls a link the API refuses expired", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(400, "This link is not valid"));
    const refused = await resetPassword("old-token", {}, form({ password: "a new password" }));
    expect(refused.error).toBe("This link has expired or was already used. Ask for a new one.");
  });
});
