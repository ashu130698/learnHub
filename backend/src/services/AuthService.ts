import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";
import redis from "../config/redis";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string; // subject = user ID (standard JWT claim name)
  role: "user" | "admin";
  iat?: number; // issued at — auto-added by jwt.sign
  exp?: number; // expires at — auto-added by jwt.sign
}

// ─────────────────────────────────────────────────────────────
// Access token
// Short-lived (15 min), stored in JS memory on the client
// Sent in every request: Authorization: Bearer <token>
// ─────────────────────────────────────────────────────────────

export function createAccessToken(
  userId: string,
  role: "user" | "admin",
): string {
  return jwt.sign(
    { sub: userId, role }, // payload — keep small, no sensitive data
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN }, // '15m'
  );
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
  } catch {
    // Token is expired, signature doesn't match, or malformed
    // Return null — caller decides what to do
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Refresh token
// Long-lived (7 days), stored in HttpOnly cookie
// NOT a JWT — just a random string stored in Redis
// Used only to get a new access token when the old one expires
// ─────────────────────────────────────────────────────────────

export function createRefreshToken(): string {
  // crypto is built into Node.js — no extra package needed
  // randomBytes(40) generates 40 cryptographically random bytes
  // toString('hex') converts to a 80-character hex string
  return crypto.randomBytes(40).toString("hex");
}

export async function storeRefreshToken(
  userId: string,
  token: string,
): Promise<void> {
  const sevenDaysInSeconds = 7 * 24 * 60 * 60;

  // Key pattern: refresh:{userId}
  // Storing by userId means one active session per user
  // If user logs in from a new device, the old refresh token is replaced
  await redis.set(`refresh:${userId}`, token, "EX", sevenDaysInSeconds);
}

export async function verifyRefreshToken(
  userId: string,
  token: string,
): Promise<boolean> {
  const stored = await redis.get(`refresh:${userId}`);

  if (!stored) return false; // token not in Redis — already logged out or expired

  // timingSafeEqual prevents timing attacks
  // Regular string comparison (===) returns faster when strings differ early
  // timingSafeEqual always takes the same time regardless of where strings differ
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(token));
}

export async function revokeRefreshToken(userId: string): Promise<void> {
  // DELETE from Redis — token is immediately invalid
  // This is why Redis is better than storing tokens in MongoDB:
  // Redis DEL is O(1) — instant invalidation, no DB scan needed
  await redis.del(`refresh:${userId}`);
}
