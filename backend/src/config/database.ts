import mongoose from "mongoose";
import { env } from "./env";

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  // Guard: don't open multiple connections if this function is called twice
  if (isConnected) {
    console.log("Using existing MongoDB connection");
    return;
  }

  try {
    await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 10, // maintain up to 10 open sockets to MongoDB
      serverSelectionTimeoutMS: 5000, // fail fast if MongoDB isn't reachable
    });

    isConnected = true;
    console.log("✅ MongoDB connected:", mongoose.connection.host);

    // If connection drops after initial connect, log it
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
      isConnected = false;
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err);
      isConnected = false;
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1); // App cannot work without the database
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}
