import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signup } from "@/actions/account";
import { SignupForm } from "./SignupForm";

vi.mock("@/actions/account", () => ({ signup: vi.fn() }));

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
