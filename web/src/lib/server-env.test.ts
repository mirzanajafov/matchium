import { apiUrl, trustedProxyHops } from "./server-env";

vi.mock("server-only", () => ({}));

describe("trustedProxyHops", () => {
  it("trusts no proxy unless told how many there are", () => {
    expect(trustedProxyHops(undefined)).toBe(0);
    expect(trustedProxyHops("1")).toBe(1);
  });

  it("refuses anything that is not a whole number of proxies", () => {
    for (const setting of ["one", "-1", "1.5", "0x1", "1e0", " 2", ""]) {
      expect(() => trustedProxyHops(setting)).toThrow(/TRUSTED_PROXY_HOPS/);
    }
  });
});

describe("apiUrl", () => {
  it("uses the local API in development and trims a trailing slash", () => {
    expect(apiUrl(undefined, false)).toBe("http://localhost:3100");
    expect(apiUrl("http://matchium-api:3100/", true)).toBe("http://matchium-api:3100");
  });

  it("refuses to guess in production, and refuses anything that isn't an http address", () => {
    expect(() => apiUrl(undefined, true)).toThrow(/API_URL/);
    for (const setting of ["matchium-api:3100", "ftp://matchium-api", "not a url"]) {
      expect(() => apiUrl(setting, false)).toThrow(/API_URL/);
    }
  });
});
