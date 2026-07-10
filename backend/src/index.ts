import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { typeDefs } from "./graphql/typeDefs";

async function main() {
  await connectDatabase();
  await redis.connect();

  // If typeDefs has any syntax error, this import throws at startup
  // Confirming it loaded means the SDL is valid
  console.log("TypeDefs kind:", typeDefs.kind); // should print: Document
  console.log(
    "Type definitions count:",
    typeDefs.definitions.length, // number of types defined
  );
  console.log("✅ GraphQL schema loaded");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
