import { Request, Response } from 'express'
import DataLoader from 'dataloader'
import mongoose from 'mongoose'
import { Progress } from '../models/Progress'
import type { TokenPayload } from '../services/authService'

export interface Context {
  req: Request
  res: Response
  user: TokenPayload | null
  progressLoader: DataLoader<string, any>
}

// ─────────────────────────────────────────────────────────────
// DataLoader: batches multiple individual DB lookups into one query
//
// Without DataLoader — resolving Module.userProgress for 6 modules:
//   Progress.findOne({ userId, moduleId: 'mod1' })  ← query 1
//   Progress.findOne({ userId, moduleId: 'mod2' })  ← query 2
//   Progress.findOne({ userId, moduleId: 'mod3' })  ← query 3
//   ... 6 total queries
//
// With DataLoader — same operation:
//   Progress.find({ userId, moduleId: { $in: ['mod1','mod2','mod3'...] } })
//   ← 1 query total, DataLoader distributes results back to each caller
// ─────────────────────────────────────────────────────────────
function createProgressLoader(userId: string) {
  return new DataLoader<string, any>(async (moduleIds) => {
    // moduleIds is an array of all IDs collected during one tick of the event loop
    const records = await Progress.find({
      userId: new mongoose.Types.ObjectId(userId),
      moduleId: { $in: moduleIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).lean()

    // DataLoader REQUIRES results returned in the same order as input keys
    // If a record doesn't exist for a moduleId, return null for that position
    return moduleIds.map(
      (moduleId) =>
        records.find((r) => r.moduleId.toString() === moduleId) ?? null
    )
  })
}

export function createContext(req: Request, res: Response): Context {
  const user = (req as any).user ?? null

  return {
    req,
    res,
    user,
    // Create a fresh DataLoader per request
    // DataLoader caches within a single request — never across requests
    progressLoader: user
      ? createProgressLoader(user.sub)
      : new DataLoader<string, any>(async (keys) => keys.map(() => null)),
  }
}