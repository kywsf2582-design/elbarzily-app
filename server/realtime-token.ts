import { jwtVerify, SignJWT } from "jose";
import { ENV } from "./_core/env";

const ISSUER = "elbarzily-realtime";
const TOKEN_TTL_SECONDS = 90;

export type RealtimeTicketClaims = { userId: number; role: string };

export async function createRealtimeTicket(
  userId: number,
  role: string,
  secret = ENV.cookieSecret,
  appId = ENV.appId,
  now = Date.now(),
): Promise<string> {
  if (!Number.isInteger(userId) || userId <= 0 || !role || !secret || !appId) {
    throw new Error("Realtime ticket configuration is incomplete");
  }
  const key = new TextEncoder().encode(secret);
  const issuedAt = Math.floor(now / 1000);
  return new SignJWT({ userId, role, appId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(appId)
    .setSubject(String(userId))
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_TTL_SECONDS)
    .sign(key);
}

export async function verifyRealtimeTicket(
  token: string,
  secret: string,
  appId: string,
  now = Date.now(),
): Promise<RealtimeTicketClaims | null> {
  if (!token || !secret || !appId) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: appId,
      currentDate: new Date(now),
    });
    const userId = Number(payload.userId);
    const role = payload.role;
    if (!Number.isInteger(userId) || userId <= 0 || typeof role !== "string" || payload.sub !== String(userId) || payload.appId !== appId) {
      return null;
    }
    return { userId, role };
  } catch {
    return null;
  }
}
