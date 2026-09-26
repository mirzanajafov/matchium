import { fireEvent, render, screen } from "@testing-library/react";
import AppError from "@/app/(app)/error";

describe("AppError", () => {
  it("explains the failure and retries on request", () => {
    const retry = vi.fn();
    render(<AppError error={new Error("API down")} retry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load this");
    expect(screen.queryByText("API down")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
