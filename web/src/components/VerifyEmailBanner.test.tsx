import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resendVerification } from "@/actions/account";
import { recordWhile } from "@/test/frames";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

vi.mock("@/actions/account", () => ({ resendVerification: vi.fn() }));

describe("VerifyEmailBanner", () => {
  beforeEach(() => {
    vi.mocked(resendVerification).mockReset();
  });

  it("resends the link and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValue({ ok: true, value: "Sent. Check your inbox." });
    render(<VerifyEmailBanner />);
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent. Check your inbox.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so in the banner when the server can't send it, and lets you try again", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValueOnce({
      ok: false,
      error: "Couldn't send it. Try again in a moment.",
    });
    render(<VerifyEmailBanner />);
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't send it. Try again in a moment.");

    vi.mocked(resendVerification).mockResolvedValueOnce({ ok: true, value: "Sent. Check your inbox." });
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent. Check your inbox.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("frees the button in the same moment it says the link wasn't sent", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValue({ ok: false, error: "Couldn't send it. Try again in a moment." });
    render(<VerifyEmailBanner />);
    const resend = screen.getByRole("button", { name: "Send the link again" });
    const locked = recordWhile(
      () => screen.queryByRole("alert") !== null,
      () => resend.hasAttribute("disabled"),
    );

    await user.click(resend);
    await screen.findByRole("alert");

    expect(locked).toEqual(new Set([false]));
  });

  it("says when the email is already confirmed instead of offering the link again", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValue({ ok: true, value: "Your email is already confirmed." });
    render(<VerifyEmailBanner />);
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your email is already confirmed.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays in place when Matchium itself can't be reached", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VerifyEmailBanner />);
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Matchium");
    expect(screen.getByRole("button", { name: "Send the link again" })).toBeInTheDocument();
  });
});
