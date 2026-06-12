import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import {
  createAccessToken,
  verifyAccessToken,
  createRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from "./services/AuthService";

async function main() {
  await connectDatabase();
  await redis.connect();

  const fakeUserId = "507f1f77bcf86cd799439011"; // valid ObjectId format

  // ── Test access token ──────────────────────────────────────
  const accessToken = createAccessToken(fakeUserId, "user");
  console.log("Access token created:", accessToken.slice(0, 30) + "...");

  const payload = verifyAccessToken(accessToken);
  console.log(
    "Token verified — userId:",
    payload?.sub,
    "| role:",
    payload?.role,
  );

  const badPayload = verifyAccessToken("not.a.real.token");
  console.log("Bad token returns null:", badPayload === null); // true

  // ── Test refresh token ─────────────────────────────────────
  const refreshToken = createRefreshToken();
  console.log("Refresh token length:", refreshToken.length); // 80 chars

  await storeRefreshToken(fakeUserId, refreshToken);
  console.log("Stored in Redis");

  const isValid = await verifyRefreshToken(fakeUserId, refreshToken);
  console.log("Refresh token valid:", isValid); // true

  const isInvalid = await verifyRefreshToken(fakeUserId, "wrongtoken");
  console.log("Wrong token valid:", isInvalid); // false

  await revokeRefreshToken(fakeUserId);
  const afterRevoke = await verifyRefreshToken(fakeUserId, refreshToken);
  console.log("After revoke valid:", afterRevoke); // false

  console.log("✅ Auth service working correctly");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
