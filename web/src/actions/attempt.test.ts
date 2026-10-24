import { unstable_rethrow } from "next/navigation";
import { ApiError } from "@/lib/api";
import { attempt } from "./attempt";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
  }),
}));
vi.mock("@/lib/session", () => ({ getToken: vi.fn() }));

const fail = (error: Error) => () => Promise.reject(error);

describe("attempt", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hands back what the call returned", async () => {
    expect(await attempt(() => Promise.resolve(3), "fallback")).toEqual({ ok: true, value: 3 });
  });

  it("uses the action's own words for a refusal it expects, and the API's for any other", async () => {
    const refusals = { 409: "That email already has an account." };
    expect(await attempt(fail(new ApiError(409, "taken")), "fallback", refusals)).toEqual({
      ok: false,
      error: "That email already has an account.",
    });
    expect(await attempt(fail(new ApiError(429, "too many attempts")), "fallback", refusals)).toEqual({
      ok: false,
      error: "Too many attempts.",
    });
  });

  it("falls back to the action's message when the API or the network fails", async () => {
    expect(await attempt(fail(new ApiError(502, "Bad Gateway")), "Try again.")).toEqual({
      ok: false,
      error: "Try again.",
    });
    expect(await attempt(fail(new TypeError("fetch failed")), "Try again.")).toEqual({
      ok: false,
      error: "Try again.",
    });
  });

  it("lets Next's redirects through instead of turning them into a message", async () => {
    await expect(attempt(fail(new Error("NEXT_REDIRECT")), "fallback")).rejects.toThrow("NEXT_REDIRECT");
    expect(unstable_rethrow).toHaveBeenCalled();
  });
});
