import { render, screen, within } from "@testing-library/react";
import type { AdminReport } from "@/lib/types";
import { ReportCard } from "./ReportCard";

vi.mock("@/app/actions", () => ({ resolveReport: vi.fn() }));

function report(overrides: Partial<AdminReport> = {}): AdminReport {
  const person = (id: string, displayName: string) => ({
    id,
    displayName,
    email: `${displayName.toLowerCase()}@example.com`,
    joinedAt: "2026-09-01T00:00:00.000Z",
    banned: false,
    reportsAgainst: 0,
  });
  return {
    id: "r1",
    reason: "SPAM",
    note: "asked for money",
    createdAt: "2026-09-26T10:00:00.000Z",
    reviewedAt: null,
    outcome: null,
    matchedOn: "2026-09-25",
    reporter: person("a", "Alice"),
    reported: { ...person("m", "Mallory"), reportsAgainst: 3 },
    messages: [
      { from: "reporter", body: "hi", sentAt: "2026-09-25T10:00:00.000Z" },
      { from: "reported", body: "send me money", sentAt: "2026-09-25T10:01:00.000Z" },
    ],
    ...overrides,
  };
}

describe("ReportCard", () => {
  it("shows who reported whom, the note and the conversation", () => {
    render(<ReportCard report={report()} />);
    expect(screen.getByRole("heading", { name: "Spam or scam" })).toBeInTheDocument();
    expect(screen.getByText("mallory@example.com", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("3 reports")).toBeInTheDocument();
    expect(screen.getByText("asked for money")).toBeInTheDocument();
    const conversation = screen.getByRole("list");
    expect(within(conversation).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Alice: hi",
      "Mallory: send me money",
    ]);
  });

  it("asks for a confirmation before a ban", () => {
    render(<ReportCard report={report()} />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "I read the conversation" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Ban Mallory" })).toBeInTheDocument();
  });

  it("shows the outcome instead of actions once reviewed", () => {
    render(<ReportCard report={report({ reviewedAt: "2026-09-26T11:00:00.000Z", outcome: "BANNED" })} />);
    expect(screen.getByText(/Banned on 26 Sept 2026/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
