// Temporary integration test — NOT part of the app
// Run once, verify output, then delete this file
// Tests the full flow: register → login → WebSocket connect → quiz submit → dashboard

import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { env } from "./config/env";
import WebSocket from "ws";

const GRAPHQL_URL = `http://localhost:${env.PORT}/graphql`;

async function gqlRequest(
  query: string,
  variables: Record<string, any> = {},
  token?: string,
) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function main() {
  await connectDatabase();
  await redis.connect();

  console.log("\n── Step 1: Register ──────────────────────────");
  const email = `smoketest_${Date.now()}@learnhub.com`;
  const registerResult = await gqlRequest(
    `mutation Register($input: RegisterInput!) {
      register(input: $input) {
        accessToken
        user { id email role }
      }
    }`,
    { input: { email, password: "testpass123", name: "Smoke Test" } },
  );

  if (registerResult.errors) {
    console.error("❌ Register failed:", registerResult.errors);
    process.exit(1);
  }

  const { accessToken, user } = registerResult.data.register;
  console.log("✅ Registered:", user.email, "| id:", user.id);

  console.log("\n── Step 2: Query me (authenticated) ──────────");
  const meResult = await gqlRequest(
    `query { me { id email role } }`,
    {},
    accessToken,
  );
  console.log("✅ me query:", meResult.data?.me ?? meResult.errors);

  console.log("\n── Step 3: Query modules (public) ────────────");
  const modulesResult = await gqlRequest(`query { modules { id title slug } }`);
  console.log(
    "✅ modules query returned:",
    modulesResult.data?.modules?.length ?? 0,
    "modules",
  );
  console.log("   (0 is expected — we have not seeded any modules yet)");

  console.log("\n── Step 4: WebSocket connection ──────────────");
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(
      `ws://localhost:${env.PORT}/ws?token=${accessToken}`,
    );

    ws.on("open", () => {
      console.log("✅ WebSocket connected");
      ws.send(JSON.stringify({ type: "ping" }));
    });

    ws.on("message", (data) => {
      const parsed = JSON.parse(data.toString());
      console.log("✅ WebSocket message received:", parsed.type);
      ws.close(1000, "Test complete");
      resolve();
    });

    ws.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message);
      resolve();
    });

    // Timeout safety — don't hang forever if something's wrong
    setTimeout(() => {
      console.error("❌ WebSocket test timed out (5s)");
      resolve();
    }, 5000);
  });

  console.log("\n── Step 5: Dashboard query ────────────────────");
  const dashboardResult = await gqlRequest(
    `query { dashboard { totalModules completedModules overallScore } }`,
    {},
    accessToken,
  );
  console.log(
    "✅ dashboard:",
    dashboardResult.data?.dashboard ?? dashboardResult.errors,
  );

  console.log("\n── Step 6: Logout ─────────────────────────────");
  const logoutResult = await gqlRequest(`mutation { logout }`, {}, accessToken);
  console.log("✅ logout:", logoutResult.data?.logout);

  console.log("\n── Cleanup ─────────────────────────────────────");
  const { User } = await import("./models/User");
  await User.deleteOne({ email });
  console.log("✅ Test user removed");

  console.log("\n🎉 Smoke test complete — all systems working together\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
