import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { saveBio } from "@/actions/profile";
import { BioForm } from "./BioForm";

vi.mock("@/actions/profile", () => ({ saveBio: vi.fn() }));

describe("BioForm", () => {
  it("lets a save that never reached Matchium be tried again", async () => {
    const user = userEvent.setup();
    vi.mocked(saveBio).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<BioForm bio="Likes long walks." />);
    await user.clear(screen.getByLabelText("About you"));
    await user.type(screen.getByLabelText("About you"), "Likes short walks.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Couldn't reach Matchium. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("About you")).toHaveValue("Likes short walks.");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
