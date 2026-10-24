import { ApiError, api, authedApi } from "@/lib/api";
import { clearSession, getPushEndpoint, getToken, setSession } from "@/lib/session";
import {
  confirmSignup,
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  unsubscribeEmail,
  uploadPhoto,
} from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({
  setSession: vi.fn(),
  getToken: vi.fn(),
  getPushEndpoint: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
  authedApi: vi.fn(),
}));

function form(fields: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("server action errors", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(authedApi).mockReset();
    vi.mocked(setSession).mockReset();
    vi.mocked(getToken).mockReset();
    vi.mocked(getPushEndpoint).mockReset();
    vi.mocked(clearSession).mockReset();
  });

  it("shows the photo limit, not the sign-up message, when the profile is full", async () => {
    vi.mocked(authedApi).mockRejectedValue(new ApiError(409, "You can have up to 4 photos"));
    const photo = new File(["jpeg"], "me.jpg", { type: "image/jpeg" });
    expect(await uploadPhoto({}, form({ photo }))).toEqual({ error: "You can have up to 4 photos." });
  });

  it("passes the API's reason on when a reset request is refused", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(429, "Too many attempts, try again in 5 minutes"));
    const refused = await requestPasswordReset({}, form({ email: "a@example.com" }));
    expect(refused.error).toBe("Too many attempts, try again in 5 minutes.");
  });

  it("sends sign-up to the inbox when the API asks for a confirmed email", async () => {
    vi.mocked(api).mockResolvedValue({ checkEmail: true });
    const sent = await signup({}, form({ email: "a@example.com", password: "long enough", seeking: "MAN" }));
    expect(sent).toMatchObject({ done: true, values: { email: "a@example.com" } });
    expect(setSession).not.toHaveBeenCalled();
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

  it("ends the session already in the browser before starting the new one", async () => {
    const steps: string[] = [];
    vi.mocked(getToken).mockResolvedValue("old-token");
    vi.mocked(api).mockImplementation(async (path, options) => {
      steps.push(`${path} ${options?.token ?? ""}`.trim());
      return path === "/auth/confirm-signup" ? { accessToken: "new-token" } : undefined;
    });
    vi.mocked(setSession).mockImplementation(async (token) => {
      steps.push(`session ${token}`);
    });
    await confirmSignup("link", {}, form({ password: "long enough" }));
    expect(steps).toEqual(["/auth/confirm-signup", "/auth/logout old-token", "session new-token"]);
  });

  it("keeps the push cookie when nobody was signed in before the login", async () => {
    vi.mocked(api).mockResolvedValue({ accessToken: "new-token" });
    await login({}, form({ email: "a@example.com", password: "long enough" }));
    expect(clearSession).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith("new-token");
  });

  it("tells a sign-up link opened with another password, or a dead one, what happened", async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(401, "That is not the password you chose when you signed up"));
    const wrong = await confirmSignup("token", {}, form({ password: "not it" }));
    expect(wrong.error).toBe("That isn't the password you chose when you signed up.");
    vi.mocked(api).mockRejectedValueOnce(new ApiError(410, "This link is not valid"));
    const dead = await confirmSignup("token", {}, form({ password: "long enough" }));
    expect(dead.error).toBe("This link has expired or was already used. Sign up again to get a new one.");
  });

  it("passes on why the API refused a new password instead of calling the link expired", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(400, "password must be shorter than or equal to 128 characters"));
    const refused = await resetPassword("token", {}, form({ password: "x".repeat(129) }));
    expect(refused.error).toBe("Password must be shorter than or equal to 128 characters.");
  });

  it("calls a link the API says is gone expired", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(410, "This link is not valid"));
    const refused = await resetPassword("old-token", {}, form({ password: "a new password" }));
    expect(refused.error).toBe("This link has expired or was already used. Ask for a new one.");
  });

  it("says an unsubscribe link the API says is gone doesn't work anymore", async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(410, "This link is not valid"));
    expect(await unsubscribeEmail("old-token")).toEqual({ done: false, error: "This link doesn't work anymore." });
  });
});
