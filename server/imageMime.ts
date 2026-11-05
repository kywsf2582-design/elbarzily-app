export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X"]);
const ascii = (data: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...data.subarray(start, end));

/** Detect a supported raster image from its bytes rather than client metadata. */
export function detectImageMime(data: Uint8Array): SupportedImageMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "image/jpeg";
  if (
    data.length >= 24 &&
    PNG_SIGNATURE.every((byte, index) => data[index] === byte) &&
    ascii(data, 12, 16) === "IHDR"
  ) return "image/png";
  if (
    data.length >= 16 &&
    ascii(data, 0, 4) === "RIFF" &&
    ascii(data, 8, 12) === "WEBP" &&
    WEBP_CHUNKS.has(ascii(data, 12, 16))
  ) return "image/webp";
  return null;
}

export function matchesSupportedImageMime(data: Uint8Array, declared: SupportedImageMime) {
  return detectImageMime(data) === declared;
}
