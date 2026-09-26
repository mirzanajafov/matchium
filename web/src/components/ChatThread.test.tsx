import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchMessages, sendMessage } from "@/app/actions";
import type { ChatMessage } from "@/lib/types";
import { ChatThread, merge } from "./ChatThread";

vi.mock("@/app/actions", () => ({ fetchMessages: vi.fn(), sendMessage: vi.fn() }));

const MATCH = "8c1f7d2e-1111-4a4a-9999-000000000001";

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data = "") {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data }));
  }

  close() {
    this.closed = true;
  }
}

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
    vi.mocked(fetchMessages).mockResolvedValue([]);
    vi.mocked(sendMessage).mockReset();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("shows messages pushed over the stream and closes it on unmount", async () => {
    const first = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    const { unmount } = render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe(`/api/chats/${MATCH}/stream`);

    await act(async () => {
      source.emit("message", JSON.stringify(message("m2", "Hi yourself", "2026-09-23T10:00:05.000Z")));
    });
    expect(screen.getByText("Hi yourself")).toBeInTheDocument();

    await act(async () => {
      source.emit("message", JSON.stringify(message("m2", "Hi yourself", "2026-09-23T10:00:05.000Z")));
    });
    expect(screen.getAllByText("Hi yourself")).toHaveLength(1);

    unmount();
    expect(source.closed).toBe(true);
  });

  it("catches up on anything missed when the stream (re)connects", async () => {
    const first = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    vi.mocked(fetchMessages).mockResolvedValue([message("m2", "Sent while you were offline", "2026-09-23T10:01:00.000Z")]);
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);

    await act(async () => {
      FakeEventSource.instances[0].emit("open");
    });
    expect(fetchMessages).toHaveBeenCalledWith(MATCH, first.createdAt);
    expect(screen.getByText("Sent while you were offline")).toBeInTheDocument();
  });

  it("falls back to polling if the stream is closed for good", async () => {
    vi.useFakeTimers();
    const first = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    vi.mocked(fetchMessages).mockResolvedValue([message("m2", "Polled", "2026-09-23T10:00:05.000Z")]);
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);
    const source = FakeEventSource.instances[0];
    source.readyState = FakeEventSource.CLOSED;

    await act(async () => {
      source.emit("error");
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText("Polled")).toBeInTheDocument();
  });

  it("locks the conversation when the other person unmatches", async () => {
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    const source = FakeEventSource.instances[0]!;
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();

    await act(async () => source.emit("closed"));

    expect(source.closed).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("This conversation has been closed.");
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });

  it("says so when messages are coming too fast", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockResolvedValue({ error: "You're sending messages too fast. Wait a moment." });
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too fast");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("hello");
  });
});

