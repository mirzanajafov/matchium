import { redirect } from "next/navigation";
import { resolveAction } from "./action-client";

describe("resolveAction", () => {
  it("passes the action's own result through", async () => {
    expect(await resolveAction(Promise.resolve({ ok: false, error: "Too fast." }))).toEqual({
      ok: false,
      error: "Too fast.",
    });
  });

  it("turns a request that never reached Matchium into a message", async () => {
    expect(await resolveAction(Promise.reject(new TypeError("Failed to fetch")))).toEqual({
      ok: false,
      error: "Couldn't reach Matchium. Check your connection and try again.",
    });
  });

  it("lets a redirect from the action through", async () => {
    const expired = Promise.resolve().then(() => redirect("/session/expired"));
    await expect(resolveAction(expired)).rejects.toThrow("NEXT_REDIRECT");
  });
});
