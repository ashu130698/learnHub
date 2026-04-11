import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { User } from "./models/User";

async function main() {
  await connectDatabase();
  await redis.connect();

  // Create a test user
  const user = await User.create({
    email: "test@learnhub.com",
    passwordHash: "plaintext123", // pre-save hook will hash this automatically
    profile: { name: "Test User" },
  });

  console.log("Created user:", user.email, "| role:", user.role);
  console.log("Password is hashed:", user.passwordHash.startsWith("$2"));

  // Verify comparePassword works
  const isValid = await user.comparePassword("plaintext123");
  const isInvalid = await user.comparePassword("wrongpassword");
  console.log("Correct password matches:", isValid); // true
  console.log("Wrong password matches:", isInvalid); // false

  // Clean up test data
  await User.deleteOne({ email: "test@learnhub.com" });
  console.log("✅ User model working correctly");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
