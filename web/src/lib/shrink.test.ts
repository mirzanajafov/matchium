import { fitWithin, shrinkForUpload } from "./shrink";

describe("fitWithin", () => {
  it("scales the long edge down and never scales up", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2160, height: 1620 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1620, height: 2160 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkForUpload", () => {
  it("hands back the original when the browser can't decode it", async () => {
    const file = new File(["x"], "photo.heic", { type: "image/heic" });
    expect(await shrinkForUpload(file)).toBe(file);
  });
});
