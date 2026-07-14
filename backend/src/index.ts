import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { resolvers } from "./graphql/resolvers";

async function main() {
  await connectDatabase();
  await redis.connect();

  console.log("Queries:", Object.keys(resolvers.Query));
  console.log("Mutations:", Object.keys(resolvers.Mutation));
  console.log("Module fields:", Object.keys(resolvers.Module));
  console.log("✅ All resolvers loaded");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
