import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const cipherAlgorithm = "aes-256-gcm";

function configuredSecret() {
  return process.env.MANUS_JWT_SECRET?.trim() || process.env.APP_SESSION_SECRET?.trim();
}

function voucherCipherKey(secret = configuredSecret()) {
  if (!secret) throw new Error("Voucher encryption secret is not configured");
  return createHash("sha256").update(secret).digest();
}

export const hashVoucherValue = (value: string) => createHash("sha256").update(value).digest("hex");

export function encryptVoucherValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(cipherAlgorithm, voucherCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptVoucherValue(payload: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid voucher payload");
  const decipher = createDecipheriv(cipherAlgorithm, voucherCipherKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}

export function voucherToken() {
  return randomBytes(32).toString("base64url");
}

export function voucherBackupCode() {
  return `BRZ-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function normalizeVoucherCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}
