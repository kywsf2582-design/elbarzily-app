import { describe, expect, it } from "vitest";
import { normalizeWhatsAppNumber, normalizeWhatsAppNumbers, whatsAppLink } from "./whatsappSupport";

describe("WhatsApp support number normalization", () => {
  it("converts common Egyptian mobile numbers to country-code format", () => {
    expect(normalizeWhatsAppNumber("01012345678")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("+20 10 1234 5678")).toBe("201012345678");
    expect(whatsAppLink(normalizeWhatsAppNumber("01012345678"))).toBe("https://wa.me/201012345678");
  });

  it("converts Arabic-Indic digits and international 00 prefixes", () => {
    expect(normalizeWhatsAppNumber("٠١٠١٢٣٤٥٦٧٨")).toBe("201012345678");
    expect(normalizeWhatsAppNumber("00201012345678")).toBe("201012345678");
  });

  it("deduplicates normalized support numbers", () => {
    expect(normalizeWhatsAppNumbers(["01012345678", "+20 10 1234 5678"])).toEqual(["201012345678"]);
  });

  it("rejects short, overlong and non-phone values", () => {
    expect(() => normalizeWhatsAppNumber("12345")).toThrow();
    expect(() => normalizeWhatsAppNumber("0000000000000000")).toThrow();
    expect(() => normalizeWhatsAppNumber("support team")).toThrow();
  });
});
