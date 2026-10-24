import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { requestPasswordReset } from "@/actions/account";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

vi.mock("@/actions/account", () => ({ requestPasswordReset: vi.fn() }));

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
