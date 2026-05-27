import mongoose, { Schema, Document } from "mongoose";

export interface IAnswerInput {
  questionId: mongoose.Types.ObjectId;
  selectedAnswers: string[]; // option IDs the user selected
}

export interface IAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  quizId: mongoose.Types.ObjectId;
  moduleId: mongoose.Types.ObjectId; // denormalized — copied from Quiz to avoid extra lookup
  answers: IAnswerInput[];
  score: number; // percentage 0-100, always calculated SERVER-SIDE
  passed: boolean;
  timeTakenSecs: number;
  createdAt: Date;
}

const attemptSchema = new Schema<IAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },

    // moduleId is stored here even though it exists in Quiz
    // Reason: dashboard query needs "all attempts by this user per module"
    // Without this, every dashboard load would require: Attempt → Quiz → Module (2 hops)
    // With this, it's a single query: Attempt.find({ userId, moduleId })
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true },

    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, required: true },
        selectedAnswers: [String],
      },
    ],

    // Score is NEVER accepted from client — always computed on server
    // If client sends score: 100, we ignore it and calculate ourselves
    score: { type: Number, required: true, min: 0, max: 100 },
    passed: { type: Boolean, required: true },
    timeTakenSecs: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }, // createdAt = when the attempt was submitted
);

// Index for dashboard: "show me all attempts by this user, newest first"
attemptSchema.index({ userId: 1, createdAt: -1 });

// Index for: "did this user already attempt this module's quiz"
attemptSchema.index({ userId: 1, moduleId: 1 });

export const Attempt = mongoose.model<IAttempt>("Attempt", attemptSchema);
