import { describe, expect, it } from "vitest";
import { detectImageMime, matchesSupportedImageMime } from "./imageMime";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);
const webp = new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBPVP8 ");

describe("image MIME signature validation", () => {
  it("detects supported image formats from their actual signatures", () => {
    expect(detectImageMime(jpeg)).toBe("image/jpeg");
    expect(detectImageMime(png)).toBe("image/png");
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("rejects unknown bytes and declared MIME mismatches", () => {
    const text = new TextEncoder().encode("not an image");
    expect(detectImageMime(text)).toBeNull();
    expect(matchesSupportedImageMime(jpeg, "image/jpeg")).toBe(true);
    expect(matchesSupportedImageMime(jpeg, "image/png")).toBe(false);
    expect(matchesSupportedImageMime(text, "image/webp")).toBe(false);
  });
});
