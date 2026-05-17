import mongoose, { Schema, Document } from "mongoose";

// ─────────────────────────────────────────────────────────────
// Lesson interface — embedded inside Module
// Lessons are NEVER queried standalone, always fetched with their module
// So embedding is correct here — no separate collection needed
// ─────────────────────────────────────────────────────────────
export interface ILesson {
  _id: mongoose.Types.ObjectId;
  title: string;
  contentUrl: string; // S3 URL pointing to the HTML guide file
  order: number; // display order within the module
  type: "reading" | "video";
}

export interface IModule extends Document {
  _id: mongoose.Types.ObjectId;
  slug: string; // URL-friendly ID: 'javascript-closures'
  title: string;
  description: string;
  order: number; // display order in the curriculum list
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMins: number;
  lessons: ILesson[]; // embedded array — lives inside the module document
  tags: string[];
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Lesson schema — used as a sub-document inside moduleSchema
const lessonSchema = new Schema<ILesson>({
  title: { type: String, required: true },
  contentUrl: { type: String, required: true },
  order: { type: Number, required: true },
  type: {
    type: String,
    enum: ["reading", "video"],
    default: "reading",
  },
});

const moduleSchema = new Schema<IModule>(
  {
    slug: {
      type: String,
      required: true,
      unique: true, // 'javascript-closures' must be unique across all modules
      lowercase: true,
      trim: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    order: { type: Number, default: 0 },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },
    estimatedMins: { type: Number, required: true, min: 1 },

    // Array of embedded lesson sub-documents
    // MongoDB stores these inside the module document itself
    lessons: [lessonSchema],

    tags: [{ type: String, lowercase: true, trim: true }],
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Indexes — MongoDB uses these to find documents fast without scanning every record
// Think of it like the index at the back of a book
moduleSchema.index({ isPublished: 1, order: 1 }); // used by the module list query
moduleSchema.index({ tags: 1 }); // used by tag filter
moduleSchema.index({ difficulty: 1 }); // used by difficulty filter

export const Module = mongoose.model<IModule>("Module", moduleSchema);
