import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unmatch } from "@/actions/matches";
import { recordWhile } from "@/test/frames";
import { UnmatchPanel } from "./UnmatchPanel";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("@/actions/matches", () => ({ unmatch: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

const MATCH = "8c1f7d2e-1111-4a4a-9999-000000000001";

describe("UnmatchPanel", () => {
  beforeEach(() => {
    vi.mocked(unmatch).mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
  });

  it("unmatches without a report and leaves the chat", async () => {
    const user = userEvent.setup();
    vi.mocked(unmatch).mockResolvedValue({ ok: true, value: undefined });
    render(<UnmatchPanel matchId={MATCH} personName="Bob" />);

    await user.click(screen.getByRole("button", { name: "Unmatch or report" }));
    await user.click(screen.getByRole("button", { name: "Unmatch" }));

    expect(unmatch).toHaveBeenCalledWith(MATCH, undefined);
    expect(router.replace).toHaveBeenCalledWith("/chats");
  });

  it("sends a report with the chosen reason and a trimmed note", async () => {
    const user = userEvent.setup();
    vi.mocked(unmatch).mockResolvedValue({ ok: true, value: undefined });
    render(<UnmatchPanel matchId={MATCH} personName="Bob" />);

    await user.click(screen.getByRole("button", { name: "Unmatch or report" }));
    await user.click(screen.getByRole("checkbox", { name: "Also report Bob" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "What happened?" }), "SPAM");
    await user.type(screen.getByRole("textbox", { name: /Anything we should know/ }), "  sent a link  ");
    await user.click(screen.getByRole("button", { name: "Unmatch and report" }));

    expect(unmatch).toHaveBeenCalledWith(MATCH, { reason: "SPAM", note: "sent a link" });
  });

  it("stays put and says so when it fails", async () => {
    const user = userEvent.setup();
    vi.mocked(unmatch).mockResolvedValue({ ok: false, error: "That didn't work. Try again." });
    render(<UnmatchPanel matchId={MATCH} personName="Bob" />);

    await user.click(screen.getByRole("button", { name: "Unmatch or report" }));
    await user.click(screen.getByRole("button", { name: "Unmatch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't work");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("frees the buttons in the same moment it says the unmatch failed", async () => {
    const user = userEvent.setup();
    vi.mocked(unmatch).mockResolvedValue({ ok: false, error: "That didn't work. Try again." });
    render(<UnmatchPanel matchId={MATCH} personName="Bob" />);
    await user.click(screen.getByRole("button", { name: "Unmatch or report" }));
    const confirm = screen.getByRole("button", { name: "Unmatch" });
    const locked = recordWhile(
      () => screen.queryByRole("alert") !== null,
      () => confirm.hasAttribute("disabled"),
    );

    await user.click(confirm);
    await screen.findByRole("alert");

    expect(locked).toEqual(new Set([false]));
  });
});
