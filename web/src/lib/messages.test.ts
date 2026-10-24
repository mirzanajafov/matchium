import { mergeMessages } from "./messages";
import type { ChatMessage } from "./types";

function message(id: string, createdAt: string): ChatMessage {
  return { id, body: id, fromMe: false, createdAt };
}

describe("mergeMessages", () => {
  it("dedupes by id and keeps time order", () => {
    const a = message("a", "2026-09-23T10:00:00.000Z");
    const b = message("b", "2026-09-23T10:01:00.000Z");
    const c = message("c", "2026-09-23T10:02:00.000Z");
    expect(mergeMessages([a, b], [b, c, a]).map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(mergeMessages([c], [a]).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("hands back the same list when nothing is new, so the thread doesn't re-render", () => {
    const current = [message("a", "2026-09-23T10:00:00.000Z")];
    expect(mergeMessages(current, [message("a", "2026-09-23T10:00:00.000Z")])).toBe(current);
  });
});
