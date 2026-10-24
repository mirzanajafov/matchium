import { SessionExpiredError, fetchInbox, fetchMessages } from "./fetchers";

describe("fetchers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the messages after a given time from the web app's own route", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "m1" }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchMessages("match 1", "2026-09-23T10:00:00.000Z")).toEqual([{ id: "m1" }]);
    expect(fetch).toHaveBeenCalledWith("/api/chats/match%201/messages?after=2026-09-23T10%3A00%3A00.000Z", {
      cache: "no-store",
    });
  });

  it("tells a session that is gone apart from an API that is only having trouble", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(fetchInbox()).rejects.toBeInstanceOf(SessionExpiredError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    await expect(fetchInbox()).rejects.not.toBeInstanceOf(SessionExpiredError);
  });
});
