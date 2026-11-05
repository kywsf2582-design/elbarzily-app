const ARABIC_DIGIT_START = 0x0660;
const PERSIAN_DIGIT_START = 0x06f0;

function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => {
    const code = digit.codePointAt(0) ?? 0;
    const start = code >= PERSIAN_DIGIT_START ? PERSIAN_DIGIT_START : ARABIC_DIGIT_START;
    return String(code - start);
  });
}

export function normalizeWhatsAppNumber(value: string): string {
  const input = value.trim();
  if (!input) return "";

  let digits = toAsciiDigits(input).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01[0125]\d{8}$/.test(digits)) digits = `20${digits.slice(1)}`;

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("أدخل رقم WhatsApp بصيغة دولية صحيحة، أو رقم هاتف محمول مصري مثل 01012345678.");
  }
  return digits;
}

export function normalizeWhatsAppNumbers(values: string[]): string[] {
  return [...new Set(values.map(normalizeWhatsAppNumber).filter(Boolean))];
}

export function whatsAppLink(number: string): string {
  return `https://wa.me/${number}`;
}
