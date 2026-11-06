import { describe, expect, it } from "vitest";
import {
  assignUniquePitchImages,
  assignUniquePlanImages,
  pitchImageAssets,
  planImageAssets,
} from "./visualAssets";

describe("curated image assignment", () => {
  it("assigns 20 different local images when pitch records have missing or legacy URLs", () => {
    const pitches = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      imageUrl: "/manus-storage/old-default.png",
    }));
    const assigned = [...assignUniquePitchImages(pitches).values()];

    expect(assigned).toHaveLength(20);
    expect(new Set(assigned).size).toBe(20);
    expect(assigned.every(image => image.startsWith("/pitch-images/"))).toBe(true);
    expect(assigned).toEqual(pitchImageAssets);
  });

  it("keeps distinct owner images and replaces duplicate ones without recycling a fallback", () => {
    const pitches = [
      { id: 4, imageUrl: "/owner/shared.webp" },
      { id: 2, imageUrl: "/owner/shared.webp" },
      { id: 3, imageUrl: "/owner/unique.webp" },
    ];
    const assigned = assignUniquePitchImages(pitches);

    expect(assigned.get(2)).toBe("/owner/shared.webp");
    expect(assigned.get(3)).toBe("/owner/unique.webp");
    expect(assigned.get(4)).toBe(pitchImageAssets[0]);
    expect(new Set(assigned.values()).size).toBe(3);
  });

  it("assigns four distinct local images to package plans with missing images", () => {
    const plans = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, imageUrl: null }));
    const assigned = [...assignUniquePlanImages(plans).values()];

    expect(assigned).toHaveLength(4);
    expect(new Set(assigned).size).toBe(4);
    expect(assigned).toEqual(planImageAssets);
  });

  it("does not duplicate a fifth image when the curated set is exhausted", () => {
    const plans = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
    const assigned = [...assignUniquePlanImages(plans).values()];

    expect(assigned.slice(0, 4)).toEqual(planImageAssets);
    expect(assigned[4]).toBe("");
  });
});
