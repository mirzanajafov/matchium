import { redirect } from "next/navigation";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { resolveAction, resolveForm } from "./action-client";

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

describe("resolveForm", () => {
  function typed() {
    const form = new FormData();
    form.set("email", "a@example.com");
    form.set("password", "long enough");
    form.append("seeking", "WOMAN");
    form.append("seeking", "MAN");
    form.set("photo", new File(["photo"], "me.jpg"));
    return form;
  }

  it("passes the form action's own state through", async () => {
    const submit = resolveForm(() => Promise.resolve({ error: "Wrong email or password." }));
    expect(await submit({}, typed())).toEqual({ error: "Wrong email or password." });
  });

  it("keeps what was typed, except the password and files, when the request never reached Matchium", async () => {
    const submit = resolveForm(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await submit({}, typed())).toEqual({
      error: "Couldn't reach Matchium. Check your connection and try again.",
      values: { email: "a@example.com", seeking: "WOMAN,MAN" },
    });
  });

  it("lets a redirect from the form action through", async () => {
    const submit = resolveForm(() => Promise.resolve().then(() => redirect("/today")));
    await expect(submit({}, typed())).rejects.toThrow("NEXT_REDIRECT");
  });
});
