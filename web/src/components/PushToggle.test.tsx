import { act, fireEvent, render, screen } from "@testing-library/react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";
import { PushToggle } from "./PushToggle";

vi.mock("@/app/actions", () => ({ savePushSubscription: vi.fn(), removePushSubscription: vi.fn() }));

const payload = { endpoint: "https://push.example/abc", keys: { p256dh: "key", auth: "secret" } };

function browser({ subscribed = false, permission = "default", grant = "granted" } = {}) {
  let current: PushSubscription | null = null;
  const makeSubscription = () =>
    ({
      endpoint: payload.endpoint,
      toJSON: () => payload,
      unsubscribe: vi.fn(async () => {
        current = null;
        return true;
      }),
    }) as unknown as PushSubscription;
  if (subscribed) current = makeSubscription();

  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = makeSubscription();
      return current;
    }),
  };
  const registration = { pushManager };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  });
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = grant;
      return grant;
    }),
  };
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("PushManager", class {});
  return { pushManager, notification };
}

describe("PushToggle", () => {
  beforeEach(() => {
    vi.mocked(savePushSubscription).mockReset();
    vi.mocked(removePushSubscription).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("says so when the browser can't do push", async () => {
    render(<PushToggle publicKey="AQID" />);
    await act(async () => undefined);
    expect(screen.getByRole("status")).toHaveTextContent("can't show notifications");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("subscribes with the server key and stores the subscription", async () => {
    const { pushManager } = browser();
    render(<PushToggle publicKey="AQID" />);
    const toggle = await screen.findByRole("switch", { name: "Notifications" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await act(async () => fireEvent.click(toggle));

    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(savePushSubscription).toHaveBeenCalledWith(payload);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("re-links an existing subscription and can turn it off", async () => {
    browser({ subscribed: true, permission: "granted" });
    render(<PushToggle publicKey="AQID" />);
    await act(async () => undefined);
    const toggle = screen.getByRole("switch", { name: "Notifications" });
    expect(savePushSubscription).toHaveBeenCalledWith(payload);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await act(async () => fireEvent.click(toggle));

    expect(removePushSubscription).toHaveBeenCalledWith(payload.endpoint);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("explains how to unblock when permission is denied", async () => {
    browser({ grant: "denied" });
    render(<PushToggle publicKey="AQID" />);
    await act(async () => undefined);
    await act(async () => fireEvent.click(await screen.findByRole("switch")));
    expect(screen.getByRole("status")).toHaveTextContent("blocked");
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
});
