import { headers } from "next/headers";
import { api, authedFetch, clientFromForwarded, relayJson } from "./api";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("./session", () => ({ getToken: vi.fn().mockResolvedValue("token-1") }));

describe("clientFromForwarded", () => {
  it("forwards no address when nothing sits in front, since the client may have written the header", () => {
    expect(clientFromForwarded("6.6.6.6", 0)).toBeUndefined();
  });

  it("trusts only the entry added by our own proxy, not what the client claims", () => {
    expect(clientFromForwarded("6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientFromForwarded("6.6.6.6, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9");
  });

  it("forwards nothing when the header is missing or shorter than the proxies in front", () => {
    expect(clientFromForwarded(null, 1)).toBeUndefined();
    expect(clientFromForwarded("6.6.6.6", 3)).toBeUndefined();
  });
});

describe("requests to the API", () => {
  const fetch = vi.fn();

  beforeEach(() => {
    fetch.mockReset().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sent(): RequestInit {
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    return init;
  }

  it("sends an object as JSON", async () => {
    await api("/auth/login", { body: { email: "a@example.com" } });
    expect(sent()).toMatchObject({ method: "POST", body: '{"email":"a@example.com"}' });
    expect(sent().headers).toMatchObject({ "content-type": "application/json" });
  });

  it("leaves the content type of an upload to fetch, so the multipart boundary is set", async () => {
    const form = new FormData();
    form.set("photo", new Blob(["jpeg"]), "me.jpg");
    await api("/me/photos", { body: form });
    expect(sent().body).toBe(form);
    expect(sent().headers).not.toHaveProperty("content-type");
  });

  it("passes the API's answer and status through for the browser's own routes", async () => {
    fetch.mockResolvedValue(new Response('{"newMatches":1}', { status: 503 }));
    const response = await relayJson("/inbox");
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"newMatches":1}');
    expect(sent().headers).toMatchObject({ authorization: "Bearer token-1" });
  });

  it("answers 401 itself when there is no session to send", async () => {
    const { getToken } = await import("./session");
    vi.mocked(getToken).mockResolvedValueOnce(undefined);
    expect((await authedFetch("/photos/1")).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
