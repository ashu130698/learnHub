import express from "express";
import { createServer } from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { connectDatabase } from "./config/database";
import redis from "./config/redis";
import { env } from "./config/env";
import { typeDefs } from "./graphql/typeDefs";
import { resolvers } from "./graphql/resolvers";
import { createContext } from "./graphql/context";
import { authenticate } from "./middleware/auth";

async function bootstrap() {
  // ── Step 1: connect to databases before anything else ─────
  await connectDatabase();
  await redis.connect();

  const app = express();

  // ── Step 2: security middleware ────────────────────────────

  // helmet sets ~15 secure HTTP response headers automatically
  // e.g. X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security
  app.use(
    helmet({
      // Apollo Studio (GraphQL playground) needs these relaxed in dev
      contentSecurityPolicy: env.NODE_ENV === "production",
      crossOriginEmbedderPolicy: env.NODE_ENV === "production",
    }),
  );

  // CORS: controls which origins can call this API
  // credentials:true is required for cookies to be sent cross-origin
  app.use(
    cors({
      origin: env.FRONTEND_URL, // only allow our Next.js frontend
      credentials: true, // allow cookies (refresh token)
      methods: ["GET", "POST"], // GraphQL only uses GET and POST
    }),
  );

  // parse cookies — needed to read refresh_token cookie in auth resolvers
  app.use(cookieParser());

  // parse JSON request bodies — required for GraphQL POST requests
  app.use(express.json({ limit: "10mb" }));

  // ── Step 3: rate limiting ──────────────────────────────────
  // Prevents brute force attacks and API abuse
  // Applied only to /graphql — not to /health
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minute window
    max: 100, // max 100 requests per window per IP
    standardHeaders: true, // return rate limit info in headers
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
  app.use("/graphql", limiter);

  // ── Step 4: auth middleware ────────────────────────────────
  // Runs before every request
  // Extracts user from JWT if present and attaches to req.user
  // Does NOT block — resolvers decide if auth is required
  app.use(authenticate);

  // ── Step 5: create Apollo Server ──────────────────────────
  const server = new ApolloServer({
    typeDefs,
    resolvers,

    // Disable introspection in production
    // Introspection lets anyone query your full schema — a security risk in prod
    introspection: env.NODE_ENV !== "production",

    // Format errors before sending to client
    formatError: (formattedError) => {
      // In production: hide internal error details from client
      // In development: show full error for debugging
      if (env.NODE_ENV === "production" && !formattedError.extensions?.code) {
        return { message: "Internal server error" };
      }
      // Log all errors server-side regardless
      console.error("GraphQL Error:", formattedError);
      return formattedError;
    },
  });

  // Apollo Server must be started before attaching to Express
  await server.start();

  // ── Step 6: attach Apollo to Express ──────────────────────
  app.use(
    "/graphql",
    expressMiddleware(server, {
      // context factory: called for every incoming GraphQL request
      // return value is passed as 3rd argument to every resolver
      context: async ({ req, res }) => createContext(req, res),
    }),
  );

  // ── Step 7: health check endpoint ─────────────────────────
  // Used by Docker, load balancers, and monitoring tools
  // Returns 200 if server is alive
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // ── Step 8: create HTTP server and start listening ─────────
  // We use createServer(app) instead of app.listen()
  // because WebSockets (next phase) need to attach to the same HTTP server
  const httpServer = createServer(app);

  const port = parseInt(env.PORT);
  httpServer.listen(port, () => {
    console.log(`🚀 GraphQL:  http://localhost:${port}/graphql`);
    console.log(`🏥 Health:   http://localhost:${port}/health`);
    console.log(`🌍 Env:      ${env.NODE_ENV}`);
  });
}

bootstrap().catch((err) => {
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});
