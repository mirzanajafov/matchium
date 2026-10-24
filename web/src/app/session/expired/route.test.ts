import { redirect } from "next/navigation";
import { clearSession } from "@/lib/session";
import { GET } from "./route";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ clearSession: vi.fn() }));

describe("GET /session/expired", () => {
  it("clears the session and sends the browser to log in on the address it used", async () => {
    await GET();
    expect(clearSession).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
