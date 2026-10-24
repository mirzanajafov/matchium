import { act, render, screen } from "@testing-library/react";
import { SessionExpiredError, fetchInbox } from "@/lib/fetchers";
import { AppNav } from "./AppNav";

vi.mock("@/lib/fetchers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fetchers")>()),
  fetchInbox: vi.fn(),
}));
const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => "/today", useRouter: () => router }));

describe("AppNav", () => {
  beforeEach(() => {
    vi.mocked(fetchInbox).mockReset();
    router.replace.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows badges only where something is waiting", async () => {
    vi.mocked(fetchInbox).mockResolvedValue({ newMatches: 3, unreadChats: 0 });
    render(<AppNav initial={{ newMatches: 3, unreadChats: 0 }} />);
    await act(async () => undefined);

    expect(screen.getByRole("link", { name: "Matches, 3 new" })).toHaveAttribute("href", "/matches");
    expect(screen.getByRole("link", { name: "Chats" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("refreshes the counts in the background", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchInbox)
      .mockResolvedValueOnce({ newMatches: 0, unreadChats: 0 })
      .mockResolvedValueOnce({ newMatches: 0, unreadChats: 2 });
    render(<AppNav initial={{ newMatches: 1, unreadChats: 0 }} />);

    await act(async () => undefined);
    expect(screen.getByRole("link", { name: "Matches" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("link", { name: "Chats, 2 new" })).toBeInTheDocument();
  });

  it("sends you to sign in again when the session is gone", async () => {
    vi.mocked(fetchInbox).mockRejectedValue(new SessionExpiredError("/api/inbox answered 401"));
    render(<AppNav initial={{ newMatches: 0, unreadChats: 0 }} />);
    await act(async () => undefined);
    expect(router.replace).toHaveBeenCalledWith("/session/expired");
  });
});
