import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { User } from "./models/User";
import { Module } from "./models/Module";
import { Quiz } from "./models/Quiz";
import { Progress } from "./models/Progress";
import { Attempt } from "./models/Attempt";

async function main() {
  await connectDatabase();
  await redis.connect();

  // Mongoose registers all models with MongoDB when imported
  // This line confirms all 5 models loaded without errors
  console.log(
    "Models loaded:",
    [User, Module, Quiz, Progress, Attempt].map((m) => m.modelName),
  );
  console.log("✅ All models ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
