import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteAccount } from "@/app/actions";
import { DeleteAccountForm } from "./DeleteAccountForm";

vi.mock("@/app/actions", () => ({ deleteAccount: vi.fn() }));

describe("DeleteAccountForm", () => {
  beforeEach(() => {
    vi.mocked(deleteAccount).mockReset();
  });

  it("asks for the password before deleting and shows a mismatch", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAccount).mockResolvedValue({ error: "That password doesn't match." });
    render(<DeleteAccountForm />);

    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.type(screen.getByLabelText("Password"), "guess");
    await user.click(screen.getByRole("button", { name: "Delete everything" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That password doesn't match.");
    const formData = vi.mocked(deleteAccount).mock.calls[0]![1];
    expect(formData.get("password")).toBe("guess");
  });

  it("can be backed out of", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountForm />);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await user.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
