import mongoose, { Schema, Document } from "mongoose";

export interface IProgress extends Document {
  userId: mongoose.Types.ObjectId;
  moduleId: mongoose.Types.ObjectId;
  completedLessons: mongoose.Types.ObjectId[]; // lesson _ids marked complete
  status: "not_started" | "in_progress" | "completed";
  startedAt?: Date;
  completedAt?: Date;
  lastAccessedAt: Date;
}

const progressSchema = new Schema<IProgress>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: true,
    },

    // $addToSet operator ensures no duplicate lesson IDs in this array
    completedLessons: [{ type: Schema.Types.ObjectId }],

    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },

    startedAt: Date,
    completedAt: Date,
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Compound unique index — one progress record per user per module
// Also makes Progress.findOne({ userId, moduleId }) extremely fast
// unique: true means MongoDB rejects a second document with the same userId+moduleId
progressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export const Progress = mongoose.model<IProgress>("Progress", progressSchema);