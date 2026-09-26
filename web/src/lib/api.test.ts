import { clientFromForwarded } from "./api";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("./session", () => ({ getToken: vi.fn() }));

describe("clientFromForwarded", () => {
  it("uses the address Next saw when nothing sits in front of it", () => {
    expect(clientFromForwarded("127.0.0.1", 1)).toBe("127.0.0.1");
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
