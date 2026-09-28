import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { requestPasswordReset, resendVerification, resetPassword } from "@/app/actions";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/ForgotPasswordForm";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/ResetPasswordForm";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

vi.mock("@/app/actions", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  resendVerification: vi.fn(),
}));

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
    vi.mocked(resetPassword).mockResolvedValue({ error: "This link has expired or was already used. Ask for a new one." });
    render(<ResetPasswordForm token="old" />);
    await user.type(screen.getByLabelText("New password"), "a new password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  });
});

describe("VerifyEmailBanner", () => {
  it("resends the link and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(resendVerification).mockResolvedValue({ sent: true });
    render(<VerifyEmailBanner />);
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent. Check your inbox.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
