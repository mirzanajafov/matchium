import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetPassword } from "@/actions/account";
import { nth } from "@/test/nth";
import { ResetPasswordForm } from "./ResetPasswordForm";

vi.mock("@/actions/account", () => ({ resetPassword: vi.fn() }));

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
    const [token, , formData] = nth(vi.mocked(resetPassword).mock.calls, 0);
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
