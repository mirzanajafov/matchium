import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { startTransition } from "react";
import { sendMessage } from "@/actions/chats";
import { SessionExpiredError, fetchMessages } from "@/lib/fetchers";
import type { ChatMessage } from "@/lib/types";
import { recordWhile } from "@/test/frames";
import { pendingAction } from "@/test/pending";
import { ChatThread } from "./ChatThread";

vi.mock("@/actions/chats", () => ({ sendMessage: vi.fn() }));
vi.mock("@/lib/fetchers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fetchers")>()),
  fetchMessages: vi.fn(),
}));
const router = { replace: vi.fn() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

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

describe("ChatThread", () => {
  const scrolls = vi.fn();

  beforeAll(() => {
    Element.prototype.scrollIntoView = scrolls;
  });

  afterAll(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  beforeEach(() => {
    vi.mocked(fetchMessages).mockReset();
    vi.mocked(fetchMessages).mockResolvedValue([]);
    vi.mocked(sendMessage).mockReset();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    scrolls.mockReset();
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
    vi.mocked(sendMessage).mockResolvedValue({
      ok: true,
      value: message("m1", "Hey Bob", "2026-09-23T10:00:00.000Z", true),
    });
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "  Hey Bob  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledWith(MATCH, "Hey Bob");
    expect(await screen.findByText("Hey Bob")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("keeps the draft when Matchium can't be reached", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach Matchium");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hello?");
  });

  it("empties the box as soon as a message is sent and keeps what's typed next", async () => {
    const user = userEvent.setup();
    const send = pendingAction<ChatMessage>();
    vi.mocked(sendMessage).mockReturnValue(send.promise);
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    const input = screen.getByRole("textbox", { name: "Message" });

    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(input).toHaveValue("");
    await user.type(input, "there");
    await act(async () => send.settle({ ok: true, value: message("m1", "Hello", "2026-09-23T10:00:00.000Z", true) }));

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(input).toHaveValue("there");
  });

  it("puts a failed message back in front of what was typed while it was sending", async () => {
    const user = userEvent.setup();
    const send = pendingAction<ChatMessage>();
    vi.mocked(sendMessage).mockReturnValue(send.promise);
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    const input = screen.getByRole("textbox", { name: "Message" });

    await user.type(input, "Are you free Saturday?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(input, "also");
    await act(async () => send.settle({ ok: false, error: "This chat is closed." }));

    expect(screen.getByRole("alert")).toHaveTextContent("This chat is closed.");
    expect(input).toHaveValue("Are you free Saturday? also");
  });

  it("keeps a failed message when typing goes on before the failure shows", async () => {
    const user = userEvent.setup();
    const send = pendingAction<ChatMessage>();
    const elsewhere = pendingAction();
    vi.mocked(sendMessage).mockReturnValue(send.promise);
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    const input = screen.getByRole("textbox", { name: "Message" });

    await user.type(input, "Are you free Saturday?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(input, "also");
    act(() => {
      startTransition(async () => {
        await elsewhere.promise;
      });
    });
    await act(async () => send.settle({ ok: false, error: "This chat is closed." }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveValue("Are you free Saturday? also");
    await user.type(input, " Sunday");
    await act(async () => elsewhere.settle({ ok: true, value: undefined }));

    expect(input).toHaveValue("Are you free Saturday? also Sunday");
  });

  it("frees Send in the same moment it says the message failed", async () => {
    const user = userEvent.setup();
    vi.mocked(sendMessage).mockResolvedValue({ ok: false, error: "This chat is closed." });
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hello?");
    const send = screen.getByRole("button", { name: "Send" });
    const locked = recordWhile(
      () => screen.queryByRole("alert") !== null,
      () => send.hasAttribute("disabled"),
    );

    await user.click(send);
    await screen.findByRole("alert");

    expect(locked).toEqual(new Set([false]));
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
    vi.mocked(fetchMessages).mockResolvedValue([
      message("m2", "Sent while you were offline", "2026-09-23T10:01:00.000Z"),
    ]);
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);

    await act(async () => {
      FakeEventSource.instances[0].emit("open");
    });
    expect(fetchMessages).toHaveBeenCalledWith(MATCH, first.createdAt);
    expect(screen.getByText("Sent while you were offline")).toBeInTheDocument();
  });

  it("sends you to sign in again when catching up finds the session gone", async () => {
    vi.mocked(fetchMessages).mockRejectedValue(new SessionExpiredError("401"));
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[]} />);
    await act(async () => {
      FakeEventSource.instances[0].emit("open");
    });
    expect(router.replace).toHaveBeenCalledWith("/session/expired");
  });

  it("catches up and opens a new stream when the old one is closed for good", async () => {
    vi.useFakeTimers();
    const first = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    vi.mocked(fetchMessages).mockResolvedValue([message("m2", "Sent meanwhile", "2026-09-23T10:00:05.000Z")]);
    const { unmount } = render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[first]} />);
    const failed = FakeEventSource.instances[0];
    failed.readyState = FakeEventSource.CLOSED;

    await act(async () => {
      failed.emit("error");
    });
    expect(screen.getByText("Sent meanwhile")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const next = FakeEventSource.instances[1];
    expect(next.url).toBe(`/api/chats/${MATCH}/stream`);
    await act(async () => {
      next.emit("message", JSON.stringify(message("m3", "Live again", "2026-09-23T10:01:00.000Z")));
    });
    expect(screen.getByText("Live again")).toBeInTheDocument();

    unmount();
    expect(next.closed).toBe(true);
  });

  it("keeps trying every five seconds for as long as the stream fails", async () => {
    vi.useFakeTimers();
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[]} />);

    for (const attempt of [0, 1, 2]) {
      const failed = FakeEventSource.instances[attempt];
      failed.readyState = FakeEventSource.CLOSED;
      await act(async () => {
        failed.emit("error");
        await vi.advanceTimersByTimeAsync(5_000);
      });
    }
    expect(FakeEventSource.instances).toHaveLength(4);
    expect(fetchMessages).toHaveBeenCalledTimes(3);
  });

  it("leaves a stream that is still reconnecting on its own alone", async () => {
    vi.useFakeTimers();
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[]} />);

    await act(async () => {
      FakeEventSource.instances[0].emit("error");
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(fetchMessages).not.toHaveBeenCalled();
  });

  it("stops trying to reconnect once you leave the chat", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[]} />);
    const failed = FakeEventSource.instances[0];
    failed.readyState = FakeEventSource.CLOSED;
    await act(async () => {
      failed.emit("error");
    });

    unmount();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("stays where you scrolled when a reconnect brings nothing new", async () => {
    vi.useFakeTimers();
    const last = message("m1", "Hi", "2026-09-23T10:00:00.000Z", true);
    vi.mocked(fetchMessages).mockResolvedValue([last]);
    render(<ChatThread matchId={MATCH} personName="Alice" initialMessages={[last]} />);
    const source = FakeEventSource.instances[0];
    scrolls.mockClear();

    await act(async () => {
      source.emit("open");
      source.emit("error");
      source.emit("open");
      source.readyState = FakeEventSource.CLOSED;
      source.emit("error");
      await vi.advanceTimersByTimeAsync(5_000);
      FakeEventSource.instances[1].emit("open");
    });
    expect(fetchMessages).toHaveBeenCalledTimes(4);
    expect(scrolls).not.toHaveBeenCalled();
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
    vi.mocked(sendMessage).mockResolvedValue({ ok: false, error: "You're sending messages too fast. Wait a moment." });
    render(<ChatThread matchId={MATCH} personName="Bob" initialMessages={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("too fast");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("hello");
  });
});
