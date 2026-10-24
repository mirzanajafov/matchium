import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { confirmSignup, requestPasswordReset, resendVerification, resetPassword, signup } from "@/actions/account";
import { ConfirmSignupForm } from "@/app/(auth)/confirm-signup/ConfirmSignupForm";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/ForgotPasswordForm";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/ResetPasswordForm";
import { SignupForm } from "@/app/(auth)/signup/SignupForm";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

vi.mock("@/actions/account", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  resendVerification: vi.fn(),
  signup: vi.fn(),
  confirmSignup: vi.fn(),
}));

describe("ConfirmSignupForm", () => {
  it("sends the link's token with the password and shows why it was refused", async () => {
    const user = userEvent.setup();
    vi.mocked(confirmSignup).mockResolvedValue({ error: "That isn't the password you chose when you signed up." });
    render(<ConfirmSignupForm token="tok" />);
    await user.type(screen.getByLabelText("Password"), "not it");
    await user.click(screen.getByRole("button", { name: "Finish signing up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't the password you chose");
    const [token, , formData] = vi.mocked(confirmSignup).mock.calls[0]!;
    expect(token).toBe("tok");
    expect(formData.get("password")).toBe("not it");
  });
});

describe("SignupForm", () => {
  it("points to the inbox once the sign-up has gone through, and lets a mistyped address be fixed", async () => {
    const user = userEvent.setup();
    vi.mocked(signup).mockResolvedValue({ done: true, values: { email: "a@example.com" } });
    render(<SignupForm />);
    await user.type(screen.getByLabelText("Email"), "a@example.com");
    await user.type(screen.getByLabelText("Password"), "long enough");
    await user.type(screen.getByLabelText("First name"), "Aysel");
    await user.type(screen.getByLabelText("Date of birth"), "1995-04-12");
    await user.type(screen.getByLabelText("City"), "Baku");
    await user.click(screen.getByLabelText("Woman"));
    await user.click(screen.getByLabelText("Men"));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Check your inbox at a@example.com");
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("a@example.com");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ForgotPasswordForm", () => {
  it("gives the same answer whether or not the account exists", async () => {
    const user = userEvent.setup();
    vi.mocked(requestPasswordReset).mockResolvedValue({ done: true, values: { email: "a@example.com" } });
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Email"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Send me a link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("If there's an account for a@example.com");
  });
});

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.mocked(resetPassword).mockReset();
  });

  it("sends the token with the new password and points to login", async () => {
    const user = userEvent.setup();
    vi.mocked(resetPassword).mockResolvedValue({ done: true });
    render(<ResetPasswordForm token="tok" />);
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("every device was signed out");
    const [token, , formData] = vi.mocked(resetPassword).mock.calls[0]!;
    expect(token).toBe("tok");
    expect(formData.get("password")).toBe("a new password");
    expect(screen.getByRole("link", { name: "Log in with the new one" })).toHaveAttribute("href", "/login");
  });

  it("explains an expired link", async () => {
    const user = userEvent.setup();
    vi.mocked(resetPassword).mockResolvedValue({
      error: "This link has expired or was already used. Ask for a new one.",
    });
    render(<ResetPasswordForm token="old" />);
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  });
});

describe("VerifyEmailBanner", () => {
  beforeEach(() => {
    vi.mocked(resendVerification).mockReset();
  });

  it("resends the link and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValue({ ok: true, value: undefined });
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

    vi.mocked(resendVerification).mockResolvedValueOnce({ ok: true, value: undefined });
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent. Check your inbox.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
