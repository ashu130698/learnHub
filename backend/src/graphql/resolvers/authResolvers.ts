import { GraphQLError } from "graphql";
import { z } from "zod";
import { User } from "../../models/User";
import {
  createAccessToken,
  createRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from "../../services/authService";
import type { Context } from "../context";

// ─────────────────────────────────────────────────────────────
// Input validation schemas
// Validate BEFORE touching the database — fail fast
// ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password required"),
});

// ─────────────────────────────────────────────────────────────
// Helper: set refresh token as HttpOnly cookie
// Called after both register and login
// ─────────────────────────────────────────────────────────────

function setRefreshCookie(res: any, token: string): void {
  res.cookie("refresh_token", token, {
    httpOnly: true, // JS cannot access this cookie — XSS protection
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: "strict", // cookie only sent on same-origin requests — CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: "/graphql", // cookie only sent to this specific path
  });
}

// ─────────────────────────────────────────────────────────────
// Resolvers
// Each function maps to a Mutation in the GraphQL schema
// Arguments: (parent, args, context)
//   parent  = result from parent resolver (unused in root mutations)
//   args    = what the client sent
//   context = shared request data: req, res, user
// ─────────────────────────────────────────────────────────────

export const authResolvers = {
  Mutation: {
    async register(
      _: unknown,
      { input }: { input: unknown },
      { res }: Context,
    ) {
      // Step 1: validate input shape and types
      const validated = registerSchema.safeParse(input);
      if (!validated.success) {
        throw new GraphQLError(validated.error.errors[0].message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const { email, password, name } = validated.data;

      // Step 2: check email uniqueness
      // findOne is faster than catching a duplicate key error
      const existing = await User.findOne({ email });
      if (existing) {
        // Generic message — never reveal whether an email exists in your system
        throw new GraphQLError("Registration failed. Please try again.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Step 3: create user
      // passwordHash = plain password here — pre-save hook hashes it automatically
      const user = await User.create({
        email,
        passwordHash: password,
        profile: { name },
      });

      // Step 4: create tokens
      const accessToken = createAccessToken(user._id.toString(), user.role);
      const refreshToken = createRefreshToken();

      // Step 5: store refresh token in Redis
      await storeRefreshToken(user._id.toString(), refreshToken);

      // Step 6: set refresh token in HttpOnly cookie
      // Client cannot read this — server sets it, server clears it
      setRefreshCookie(res, refreshToken);

      // Step 7: return access token + safe user data
      // passwordHash is excluded by select:false — not returned here
      return {
        accessToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          createdAt: user.createdAt,
        },
      };
    },

    async login(_: unknown, { input }: { input: unknown }, { res }: Context) {
      // Step 1: validate
      const validated = loginSchema.safeParse(input);
      if (!validated.success) {
        // Use the same generic error message as wrong password
        // Never differentiate between "email not found" and "wrong password"
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      const { email, password } = validated.data;

      // Step 2: find user — explicitly select passwordHash (select:false by default)
      const user = await User.findOne({ email }).select("+passwordHash");

      // Step 3: verify password
      // Both checks in one condition — same error message either way
      // This prevents user enumeration: attacker can't tell if email exists
      if (!user || !(await user.comparePassword(password))) {
        throw new GraphQLError("Invalid credentials", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      // Step 4: issue tokens
      const accessToken = createAccessToken(user._id.toString(), user.role);
      const refreshToken = createRefreshToken();
      await storeRefreshToken(user._id.toString(), refreshToken);
      setRefreshCookie(res, refreshToken);

      return {
        accessToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          createdAt: user.createdAt,
        },
      };
    },

    async logout(_: unknown, __: unknown, { res, user }: Context) {
      // Revoke refresh token from Redis if user is logged in
      if (user) {
        await revokeRefreshToken(user.sub);
      }

      // Clear the cookie from the browser
      res.clearCookie("refresh_token", { path: "/graphql" });

      return true;
    },

    async refreshToken(_: unknown, __: unknown, { req, res }: Context) {
      // Read refresh token from HttpOnly cookie
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        throw new GraphQLError("No refresh token provided", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      // Find which user this refresh token belongs to
      // Strategy: encode userId in a separate cookie (not sensitive)
      // or store userId→token mapping in Redis hash
      // Simple approach for now: read userId from a non-httpOnly cookie
      const userId = req.cookies?.user_id;
      if (!userId) {
        throw new GraphQLError("Invalid session", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      // Verify token matches what is stored in Redis
      const isValid = await verifyRefreshToken(userId, refreshToken);
      if (!isValid) {
        throw new GraphQLError("Invalid or expired refresh token", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      // Find user in DB to get current role (role may have changed since last login)
      const user = await User.findById(userId);
      if (!user) {
        throw new GraphQLError("User not found", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      // Token rotation: issue new refresh token, invalidate old one
      // If old token leaks, attacker can only use it once before it's rotated
      const newAccessToken = createAccessToken(user._id.toString(), user.role);
      const newRefreshToken = createRefreshToken();
      await storeRefreshToken(user._id.toString(), newRefreshToken);
      setRefreshCookie(res, newRefreshToken);

      return {
        accessToken: newAccessToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile,
          createdAt: user.createdAt,
        },
      };
    },
  },
};
