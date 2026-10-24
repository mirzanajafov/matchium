import { redirect } from "next/navigation";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
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

  it("asks for a reload when the page still calls an action from before a deploy", async () => {
    expect(await resolveAction(Promise.reject(new UnrecognizedActionError("Server Action not found")))).toEqual({
      ok: false,
      error: "Matchium was just updated. Reload the page and try again.",
    });
  });

  it("lets a redirect from the action through", async () => {
    const expired = Promise.resolve().then(() => redirect("/session/expired"));
    await expect(resolveAction(expired)).rejects.toThrow("NEXT_REDIRECT");
  });
});
