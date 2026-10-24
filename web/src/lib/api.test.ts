import { clientFromForwarded, trustedProxyHops } from "./api";

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

  it("copes with missing or short headers", () => {
    expect(clientFromForwarded(null, 1)).toBeUndefined();
    expect(clientFromForwarded("203.0.113.9", 3)).toBe("203.0.113.9");
  });
});

describe("trustedProxyHops", () => {
  it("trusts no proxy unless told how many there are", () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops("1")).toBe(1);
  });

  it("refuses anything that is not a whole number of proxies", () => {
    for (const setting of ["one", "-1", "1.5"]) expect(() => trustedProxyHops(setting)).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
