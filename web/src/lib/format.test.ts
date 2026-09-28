import { confidenceCaption, confidenceLabel, dimensionLabel, joinWords, longDate, percent, shiftSentence, shortDate } from "./format";

describe("format", () => {
  it("joins words like a person would", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["family"])).toBe("family");
    expect(joinWords(["family", "planning ahead"])).toBe("family and planning ahead");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
  });

  it("describes what likes revealed", () => {
    expect(shiftSentence({ dimension: "activity", direction: "less" })).toBe(
      "You go for less staying active than your answers suggest.",
    );
  });

  it("maps engine dimensions to readable labels", () => {
    expect(dimensionLabel("activity")).toBe("staying active");
    expect(dimensionLabel("something_new")).toBe("something new");
  });

  it("clamps percentages and labels confidence", () => {
    expect(percent(0.876)).toBe(88);
    expect(percent(1.4)).toBe(100);
    expect(percent(-1)).toBe(0);
    expect(confidenceLabel(0.1)).toBe("Early guess");
    expect(confidenceLabel(0.45)).toBe("Getting clearer");
    expect(confidenceLabel(0.9)).toBe("Fairly sure");
  });

  it("hides a meaningless percentage on very early guesses", () => {
    expect(confidenceCaption(0.04)).toBe("Early guess");
    expect(confidenceCaption(0.17)).toBe("Early guess · 17% confidence");
    expect(confidenceCaption(0.72)).toBe("Fairly sure · 72% confidence");
  });

  it("writes dates the way people read them", () => {
    const today = new Date("2026-09-28T12:00:00Z");
    expect(shortDate("2026-09-23", today)).toBe("23 Sept");
    expect(shortDate("2025-12-31", today)).toBe("31 Dec 2025");
    expect(longDate("1993-04-16")).toBe("16 April 1993");
  });
});
