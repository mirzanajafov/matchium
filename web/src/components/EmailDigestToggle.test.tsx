import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setEmailDigest } from "@/actions/profile";
import type { ActionResult } from "@/lib/types";
import { EmailDigestToggle } from "./EmailDigestToggle";

vi.mock("@/actions/profile", () => ({ setEmailDigest: vi.fn() }));

describe("EmailDigestToggle", () => {
  beforeEach(() => {
    vi.mocked(setEmailDigest).mockReset();
  });

  it("saves the opposite of the current setting", async () => {
    const user = userEvent.setup();
    vi.mocked(setEmailDigest).mockResolvedValue({ ok: true, value: undefined });
    render(<EmailDigestToggle enabled />);
    const toggle = screen.getByRole("switch", { name: "Match emails" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    expect(setEmailDigest).toHaveBeenCalledWith(false);
  });

  it("flips back and says so when the setting can't be saved, until the next try", async () => {
    const user = userEvent.setup();
    let answer: (result: ActionResult) => void = () => undefined;
    vi.mocked(setEmailDigest).mockReturnValueOnce(
      new Promise<ActionResult>((resolve) => {
        answer = resolve;
      }),
    );
    render(<EmailDigestToggle enabled />);
    const toggle = screen.getByRole("switch", { name: "Match emails" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await act(async () => answer({ ok: false, error: "Couldn't save that. Try again." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that. Try again.");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(toggle).toHaveAccessibleDescription("Couldn't save that. Try again.");

    vi.mocked(setEmailDigest).mockReturnValueOnce(new Promise<ActionResult>(() => undefined));
    await user.click(toggle);
    expect(setEmailDigest).toHaveBeenCalledTimes(2);
    expect(setEmailDigest).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
