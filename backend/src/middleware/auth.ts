import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../services/authService";

// Extend Express's Request type to include our user field
// Without this TypeScript would error: Property 'user' does not exist on Request
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// authenticate middleware
// Runs on EVERY request before it reaches GraphQL
// Extracts the user from the JWT if one is present
// Does NOT block requests — resolvers decide if auth is required
// ─────────────────────────────────────────────────────────────
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  // No token present — continue without user
  // Public routes (module list, login, register) work fine without a user
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  // Remove 'Bearer ' prefix to get the raw token string
  const token = header.slice(7);

  const payload = verifyAccessToken(token);

  if (payload) {
    req.user = payload; // attach to request — available in GraphQL context
  }
  // If token is invalid or expired, req.user stays undefined
  // Resolvers that require auth will throw when they check context.user

  next();
}