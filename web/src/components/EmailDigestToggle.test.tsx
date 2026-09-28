import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setEmailDigest } from "@/app/actions";
import { EmailDigestToggle } from "./EmailDigestToggle";

vi.mock("@/app/actions", () => ({ setEmailDigest: vi.fn() }));

describe("EmailDigestToggle", () => {
  it("saves the opposite of the current setting", async () => {
    const user = userEvent.setup();
    vi.mocked(setEmailDigest).mockResolvedValue(undefined);
    render(<EmailDigestToggle enabled />);
    const toggle = screen.getByRole("switch", { name: "Match emails" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    expect(setEmailDigest).toHaveBeenCalledWith(false);
  });
});
