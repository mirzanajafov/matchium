import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchMessages, sendMessage } from "@/app/actions";
import type { ChatMessage } from "@/lib/types";
import { ChatThread, merge } from "./ChatThread";

vi.mock("@/app/actions", () => ({ fetchMessages: vi.fn(), sendMessage: vi.fn() }));

const MATCH = "8c1f7d2e-1111-4a4a-9999-000000000001";

function message(id: string, body: string, createdAt: string, fromMe = false): ChatMessage {
  return { id, body, fromMe, createdAt };
}

describe("merge", () => {
  it("dedupes by id and keeps time order", () => {
    const a = message("a", "one", "2026-09-23T10:00:00.000Z");
    const b = message("b", "two", "2026-09-23T10:01:00.000Z");
    const c = message("c", "three", "2026-09-23T10:02:00.000Z");
    expect(merge([a, b], [b, c, a]).map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(merge([c], [a]).map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("ChatThread", () => {
  beforeEach(() => {
    vi.mocked(fetchMessages).mockReset();
    vi.mocked(sendMessage).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invites you to start when there are no messages", () => {
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    expect(screen.getByText("You both said yes. Say hi to Bob.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends a trimmed message and clears the input", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockResolvedValue(message("m1", "Hey Bob", "2026-09-23T10:00:00.000Z", true));
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "  Hey Bob  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledWith(MATCH, "Hey Bob");
    expect(await screen.findByText("Hey Bob")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("keeps the draft when sending fails", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockImplementation(async () => {
      throw new Error("offline");
    });
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("didn't go through");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hello?");
  });

  it("polls for new messages after the latest one", async () => {
    vi.useFakeTimers();
    const first = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    vi.mocked(fetchMessages).mockResolvedValue([first, message("m2", "Hi yourself", "2026-09-23T10:00:05.000Z")]);
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(fetchMessages).toHaveBeenCalledWith(MATCH, first.createdAt);
    expect(screen.getByText("Hi yourself")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
