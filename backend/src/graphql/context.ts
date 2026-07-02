import { Request, Response } from "express";
import type { TokenPayload } from "../services/authService";

// Context is created once per GraphQL request
// Passed as the 3rd argument to EVERY resolver
// This is how resolvers know who is making the request
export interface Context {
  req: Request;
  res: Response;
  user: TokenPayload | null; // null = not logged in
}

export function createContext(req: Request, res: Response): Context {
  // req.user was set by authenticate middleware in index.ts
  // If no valid JWT was present, req.user is undefined
  return {
    req,
    res,
    user: req.user ?? null,
  };
}
