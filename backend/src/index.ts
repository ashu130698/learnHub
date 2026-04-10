import { connectDatabase } from "./config/database";
import redis from "./config/redis";

async function main() {
  // Connect to MongoDB
  await connectDatabase();

  // Connect to Redis
  await redis.connect();

  // Quick test: set a value in Redis and read it back
  await redis.set("test:ping", "pong", "EX", 10); // expires in 10 seconds
  const value = await redis.get("test:ping");
  console.log("Redis test:", value); // should print: Redis test: pong

  console.log("✅ All systems connected");
}

main().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
