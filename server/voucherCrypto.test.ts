import { afterEach, describe, expect, it } from "vitest";
import { decryptVoucherValue, encryptVoucherValue } from "./voucherCrypto";

const originalManusSecret = process.env.MANUS_JWT_SECRET;
const originalSessionSecret = process.env.APP_SESSION_SECRET;

afterEach(() => {
  if (originalManusSecret === undefined) delete process.env.MANUS_JWT_SECRET;
  else process.env.MANUS_JWT_SECRET = originalManusSecret;
  if (originalSessionSecret === undefined) delete process.env.APP_SESSION_SECRET;
  else process.env.APP_SESSION_SECRET = originalSessionSecret;
});

describe("voucher encryption configuration", () => {
  it("encrypts and decrypts vouchers with the configured app session secret when the legacy secret is absent", () => {
    delete process.env.MANUS_JWT_SECRET;
    process.env.APP_SESSION_SECRET = "test-session-secret-with-sufficient-entropy";
    const encrypted = encryptVoucherValue("BRZ-ABCD-1234");
    expect(decryptVoucherValue(encrypted)).toBe("BRZ-ABCD-1234");
  });

  it("keeps using the legacy secret when it is configured", () => {
    process.env.MANUS_JWT_SECRET = "legacy-voucher-secret";
    process.env.APP_SESSION_SECRET = "different-session-secret";
    const encrypted = encryptVoucherValue("voucher-value");
    expect(decryptVoucherValue(encrypted)).toBe("voucher-value");
  });

  it("fails closed when neither secret exists", () => {
    delete process.env.MANUS_JWT_SECRET;
    delete process.env.APP_SESSION_SECRET;
    expect(() => encryptVoucherValue("voucher-value")).toThrow("Voucher encryption secret is not configured");
  });
});
