import { fireEvent, render, screen } from "@testing-library/react";
import AuthError from "./error";

describe("AuthError", () => {
  it("explains the failure and retries on request", () => {
    const retry = vi.fn();
    render(<AuthError error={new Error("API down")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something on our side didn't answer. Try again in a moment.");
    expect(screen.queryByText("API down")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
