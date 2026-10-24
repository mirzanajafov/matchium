import { clearSession } from "@/lib/session";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({ clearSession: vi.fn() }));

describe("GET /session/expired", () => {
  it("clears the session and sends the browser to log in on the address it used", async () => {
    const response = await GET();
    expect(clearSession).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });
});
