import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { decide } from "@/app/actions";
import type { Match } from "@/lib/types";
import { MatchCard } from "./MatchCard";

vi.mock("@/app/actions", () => ({ decide: vi.fn() }));

const match: Match = {
  id: "8c1f7d2e-1111-4a4a-9999-000000000001",
  score: 0.814,
  confidence: 0.42,
  aligned: ["family", "planning"],
  friction: "adventure",
  person: { id: "p1", displayName: "Aysel", age: 29, city: "Baku" },
  decision: null,
  mutual: false,
};

describe("MatchCard", () => {
  beforeEach(() => {
    vi.mocked(decide).mockReset();
  });

  it("explains the match in plain words", () => {
    render(<MatchCard match={match} />);
    expect(screen.getByRole("heading", { name: "Aysel, 29" })).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    expect(screen.getByText("Getting clearer · 42% confidence")).toBeInTheDocument();
    expect(screen.getByText("You're on the same page about family and planning ahead.")).toBeInTheDocument();
    expect(screen.getByText("You might see adventure differently.")).toBeInTheDocument();
  });

  it("celebrates when the like is mutual", async () => {
    vi.mocked(decide).mockResolvedValue({ mutual: true });
    render(<MatchCard match={match} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "I'm interested" }));
    expect(decide).toHaveBeenCalledWith(match.id, true);
    expect(await screen.findByText("It's mutual. You both said yes.")).toBeInTheDocument();
  });

  it("remembers a pass", async () => {
    vi.mocked(decide).mockResolvedValue({ mutual: false });
    render(<MatchCard match={match} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Pass" }));
    expect(await screen.findByText("You passed on this one.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an earlier decision without buttons", () => {
    render(<MatchCard match={{ ...match, decision: "LIKE" }} />);
    expect(screen.getByText("You said yes. We'll let you know if it's mutual.")).toBeInTheDocument();
  });
});
