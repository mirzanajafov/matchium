import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { confirmSignup } from "@/actions/account";
import { ConfirmSignupForm } from "./ConfirmSignupForm";
import { nth } from "@/test/nth";

vi.mock("@/actions/account", () => ({ confirmSignup: vi.fn() }));

describe("ConfirmSignupForm", () => {
  it("sends the link's token with the password and shows why it was refused", async () => {
    const user = userEvent.setup();
    vi.mocked(confirmSignup).mockResolvedValue({ error: "That isn't the password you chose when you signed up." });
    render(<ConfirmSignupForm token="tok" />);
    await user.type(screen.getByLabelText("Password"), "not it");
    await user.click(screen.getByRole("button", { name: "Finish signing up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't the password you chose");
    const [token, , formData] = nth(vi.mocked(confirmSignup).mock.calls, 0);
    expect(token).toBe("tok");
    expect(formData.get("password")).toBe("not it");
  });
});
