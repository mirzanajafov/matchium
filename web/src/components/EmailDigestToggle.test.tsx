import { act, render, screen, waitFor } from "@testing-library/react";
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

  it("flips back and says so when the setting can't be saved, until the next try", async () => {
    const user = userEvent.setup();
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(setEmailDigest).mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    render(<EmailDigestToggle enabled />);
    const toggle = screen.getByRole("switch", { name: "Match emails" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await act(async () => fail(new Error("API answered 502")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that. Try again.");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(toggle).toHaveAccessibleDescription("Couldn't save that. Try again.");

    vi.mocked(setEmailDigest).mockReturnValueOnce(new Promise<void>(() => undefined));
    await user.click(toggle);
    expect(setEmailDigest).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
