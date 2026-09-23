import { confidenceLabel, dimensionLabel, joinWords, percent } from "./format";

describe("format", () => {
  it("joins words like a person would", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["family"])).toBe("family");
    expect(joinWords(["family", "planning ahead"])).toBe("family and planning ahead");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
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
});
