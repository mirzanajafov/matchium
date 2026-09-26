import { decodeKey, toPayload } from "./push";

describe("push helpers", () => {
  it("decodes url-safe base64 keys without padding", () => {
    expect(Array.from(decodeKey("-_8"))).toEqual([251, 255]);
    expect(Array.from(decodeKey("AQID"))).toEqual([1, 2, 3]);
  });

  it("only accepts complete subscriptions", () => {
    const subscription = (json: PushSubscriptionJSON) => ({ toJSON: () => json }) as PushSubscription;
    expect(toPayload(subscription({ endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } }))).toEqual({
      endpoint: "https://push.example/1",
      keys: { p256dh: "k", auth: "a" },
    });
    expect(toPayload(subscription({ endpoint: "https://push.example/1", keys: { p256dh: "k" } }))).toBeNull();
  });
});
