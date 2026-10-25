import { fireEvent, render, screen } from "@testing-library/react";
import AuthError from "./error";

describe("AuthError", () => {
  it("explains the failure and retries on request", () => {
    const retry = vi.fn();
    render(<AuthError error={new TypeError("Failed to fetch")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't reach Matchium");
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
