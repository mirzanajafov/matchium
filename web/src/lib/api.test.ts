import { clientFromForwarded } from "./api";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("./session", () => ({ getToken: vi.fn() }));

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
