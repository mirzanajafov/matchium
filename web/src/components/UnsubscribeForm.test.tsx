import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { unsubscribeEmail } from "@/app/actions";
import { UnsubscribeForm } from "./UnsubscribeForm";

vi.mock("@/app/actions", () => ({ unsubscribeEmail: vi.fn() }));

describe("UnsubscribeForm", () => {
  beforeEach(() => {
    vi.mocked(unsubscribeEmail).mockReset();
  });

  it("does nothing until the button is pressed, so link scanners can't unsubscribe you", async () => {
    const user = userEvent.setup();
    vi.mocked(unsubscribeEmail).mockResolvedValue({ done: true });
    render(<UnsubscribeForm token="tok" />);
    expect(unsubscribeEmail).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Stop these emails" }));

    expect(unsubscribeEmail).toHaveBeenCalledWith("tok");
    expect(await screen.findByRole("status")).toHaveTextContent("You won't get these emails anymore");
  });

  it("explains a dead link", async () => {
    const user = userEvent.setup();
    vi.mocked(unsubscribeEmail).mockResolvedValue({ done: false, error: "This link doesn't work anymore." });
    render(<UnsubscribeForm token="old" />);
    await user.click(screen.getByRole("button", { name: "Stop these emails" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't work anymore");
  });

  it("says so when the server can't be reached, until the next try", async () => {
    const user = userEvent.setup();
    vi.mocked(unsubscribeEmail)
      .mockRejectedValueOnce(new Error("API answered 502"))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(<UnsubscribeForm token="tok" />);
    await user.click(screen.getByRole("button", { name: "Stop these emails" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in a moment");

    await user.click(screen.getByRole("button", { name: "Stop these emails" }));
    expect(unsubscribeEmail).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
