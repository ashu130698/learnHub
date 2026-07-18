import { GraphQLError } from "graphql";
import { Module } from "../../models/Module";
import { Quiz } from "../../models/Quiz";
import { Attempt } from "../../models/Attempt";
import { Progress } from "../../models/Progress";
import { sendToUser } from "../../websocket/wsServer";
import { getOrSet, invalidatePattern } from "../../config/redis";
import type { Context } from "../context";

// ─────────────────────────────────────────────────────────────
// Helper: throw if user is not logged in
// Called at the top of every protected resolver
// ─────────────────────────────────────────────────────────────
function requireAuth(context: Context) {
  if (!context.user) {
    throw new GraphQLError("You must be logged in", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.user; // return so we can use it immediately
}

export const contentResolvers = {
  Query: {
    // ── modules ───────────────────────────────────────────────
    // Public — no auth required
    // Cached in Redis for 1 hour — module list rarely changes
    async modules(_: unknown, args: { difficulty?: string; tag?: string }) {
      // Cache key includes filters so different filter combos are cached separately
      const cacheKey = `modules:list:${JSON.stringify(args)}`;

      return getOrSet(
        cacheKey,
        async () => {
          const query: Record<string, any> = { isPublished: true };

          // Only add filter to query if it was actually provided
          if (args.difficulty) query.difficulty = args.difficulty.toLowerCase();
          if (args.tag) query.tags = args.tag.toLowerCase();

          return Module.find(query)
            .sort({ order: 1 }) // sort by display order ascending
            .lean(); // .lean() returns plain JS objects, not Mongoose documents
          // faster and uses less memory — use when you don't need
          // Mongoose methods like .save() on the result
        },
        3600, // cache for 1 hour
      );
    },

    // ── module ────────────────────────────────────────────────
    // Public — fetch single module by slug
    async module(_: unknown, { slug }: { slug: string }) {
      return getOrSet(
        `module:${slug}`,
        async () => {
          const mod = await Module.findOne({ slug, isPublished: true }).lean();
          if (!mod) {
            throw new GraphQLError("Module not found", {
              extensions: { code: "NOT_FOUND" },
            });
          }
          return mod;
        },
        3600,
      );
    },

    // ── me ────────────────────────────────────────────────────
    // Auth required — returns current logged-in user's data
    async me(_: unknown, __: unknown, context: Context) {
      const user = requireAuth(context);
      const { User } = await import("../../models/User");
      const found = await User.findById(user.sub).lean();
      if (!found) throw new GraphQLError("User not found");
      return found;
    },

    // ── quiz ──────────────────────────────────────────────────
    // Auth required
    // IMPORTANT: correctAnswers and explanation are stripped before returning
    // They are only revealed in Attempt.breakdown after submission
    async quiz(
      _: unknown,
      { moduleId }: { moduleId: string },
      context: Context,
    ) {
      requireAuth(context);

      return getOrSet(
        `quiz:${moduleId}`,
        async () => {
          const quiz = await Quiz.findOne({ moduleId }).lean();
          if (!quiz) return null;

          // Strip sensitive fields from each question
          return {
            ...quiz,
            questions: quiz.questions.map((q) => ({
              ...q,
              correctAnswers: undefined, // never sent to client during fetch
              explanation: undefined, // only revealed after submission
            })),
          };
        },
        7200, // cache for 2 hours
      );
    },

    // ── myAttempts ────────────────────────────────────────────
    // Auth required — all quiz attempts by the current user
    async myAttempts(
      _: unknown,
      { moduleId }: { moduleId?: string },
      context: Context,
    ) {
      const user = requireAuth(context);

      const query: Record<string, any> = { userId: user.sub };
      if (moduleId) query.moduleId = moduleId; // filter by module if provided

      return Attempt.find(query)
        .sort({ createdAt: -1 }) // newest first
        .limit(50) // never return unlimited records
        .lean();
    },

    // ── dashboard ─────────────────────────────────────────────
    // Auth required — aggregated stats for the user's dashboard
    // Cached for 5 minutes — invalidated when user completes lesson or submits quiz
    async dashboard(_: unknown, __: unknown, context: Context) {
      const user = requireAuth(context);
      const cacheKey = `dashboard:${user.sub}`;

      return getOrSet(
        cacheKey,
        async () => {
          // Run all three DB queries IN PARALLEL using Promise.all
          // Sequential: 3 queries × ~10ms = ~30ms
          // Parallel:   max(10ms, 10ms, 10ms) = ~10ms
          const [totalModules, progressRecords, recentAttempts] =
            await Promise.all([
              Module.countDocuments({ isPublished: true }),
              Progress.find({ userId: user.sub }).lean(),
              Attempt.find({ userId: user.sub })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            ]);

          const completedModules = progressRecords.filter(
            (p) => p.status === "completed",
          ).length;

          const inProgressModules = progressRecords.filter(
            (p) => p.status === "in_progress",
          ).length;

          // Average score across recent attempts — 0 if no attempts yet
          const overallScore =
            recentAttempts.length > 0
              ? recentAttempts.reduce((sum, a) => sum + a.score, 0) /
                recentAttempts.length
              : 0;

          return {
            totalModules,
            completedModules,
            inProgressModules,
            recentAttempts,
            overallScore: Math.round(overallScore * 100) / 100,
          };
        },
        300, // cache for 5 minutes
      );
    },
  },

  Mutation: {
    // ── markLessonComplete ────────────────────────────────────
    async markLessonComplete(
      _: unknown,
      { lessonId, moduleId }: { lessonId: string; moduleId: string },
      context: Context,
    ) {
      const user = requireAuth(context);

      // findOneAndUpdate with upsert:
      // - If progress record exists → update it
      // - If it doesn't exist → create it
      // This is atomic — no race condition between check and insert
      const progress = await Progress.findOneAndUpdate(
        { userId: user.sub, moduleId },
        {
          // $addToSet: add lessonId only if not already in the array
          // Idempotent: calling this twice has the same result as calling it once
          $addToSet: { completedLessons: lessonId },
          $set: { lastAccessedAt: new Date() },
          // $setOnInsert: these fields only set when CREATING (not when updating)
          $setOnInsert: { startedAt: new Date(), status: "in_progress" },
        },
        {
          upsert: true, // create if doesn't exist
          new: true, // return the updated document, not the original
        },
      );

      // Check if all lessons in the module are now complete
      const mod = await Module.findById(moduleId).lean();
      if (mod && progress!.completedLessons.length >= mod.lessons.length) {
        await Progress.findByIdAndUpdate(progress!._id, {
          $set: { status: "completed", completedAt: new Date() },
        });
        progress!.status = "completed";
      } else if (progress!.status === "not_started") {
        await Progress.findByIdAndUpdate(progress!._id, {
          $set: { status: "in_progress" },
        });
        progress!.status = "in_progress";
      }

      // Invalidate dashboard cache — user's stats changed
      await invalidatePattern(`dashboard:${user.sub}`);

      // Notify client that lesson was marked complete
      sendToUser(user.sub, {
        type: "lesson_completed",
        payload: {
          lessonId,
          moduleId,
          status: progress!.status,
        },
        timestamp: new Date().toISOString(),
      });

      return progress;
    },

    // ── submitQuiz ────────────────────────────────────────────
    async submitQuiz(_: unknown, { input }: { input: any }, context: Context) {
      const user = requireAuth(context);

      // Fetch quiz WITH correctAnswers from DB
      // This is a server-only operation — correctAnswers never came from the client
      const quiz = await Quiz.findById(input.quizId).lean();
      if (!quiz) {
        throw new GraphQLError("Quiz not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      // ── Score each question server-side ───────────────────
      let totalPoints = 0;
      let earnedPoints = 0;
      const breakdown = [];

      for (const question of quiz.questions) {
        totalPoints += question.points;

        // Find the user's answer for this question
        const answer = input.answers.find(
          (a: any) => a.questionId === question._id.toString(),
        );
        const selected: string[] = answer?.selectedAnswers ?? [];
        const correct: string[] = question.correctAnswers;

        // Correct only if:
        // - selected count matches correct count (no extras, no missing)
        // - every correct answer is in selected
        const isCorrect =
          correct.length === selected.length &&
          correct.every((c) => selected.includes(c));

        if (isCorrect) earnedPoints += question.points;

        breakdown.push({
          questionId: question._id,
          isCorrect,
          explanation: question.explanation, // now we reveal it
          correctAnswers: correct, // now we reveal it
        });
      }

      // Calculate percentage score
      const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
      const passed = score >= quiz.passingScore;

      // Save attempt to DB
      const attempt = await Attempt.create({
        userId: user.sub,
        quizId: input.quizId,
        moduleId: input.moduleId,
        answers: input.answers,
        score: Math.round(score * 100) / 100, // round to 2 decimal places
        passed,
        timeTakenSecs: input.timeTakenSecs,
      });

      // Notify client in real-time that quiz was submitted
      // Client receives this instantly via WebSocket — no polling needed
      sendToUser(user.sub, {
        type: "quiz_submitted",
        payload: {
          moduleId: input.moduleId,
          score: Math.round(score * 100) / 100,
          passed,
          timeTakenSecs: input.timeTakenSecs,
        },
        timestamp: new Date().toISOString(),
      });

      // Invalidate dashboard cache — attempt count and score changed
      await invalidatePattern(`dashboard:${user.sub}`);

      // Return attempt + breakdown (breakdown has correctAnswers + explanations)
      return { ...attempt.toObject(), breakdown };
    },
  },

  // ── Field resolver: Module.userProgress ───────────────────
  // This runs for EVERY module in the list query
  // DataLoader (added in next step) batches all these into ONE DB query
  Module: {
    async userProgress(parent: any, _: unknown, context: Context) {
      if (!context.user) return null; // not logged in — no progress to show

      // Use DataLoader from context to batch this lookup
      // Without DataLoader: 6 modules = 6 separate DB queries
      // With DataLoader: 6 modules = 1 DB query
      return context.progressLoader.load(parent._id.toString());
    },
  },
};
