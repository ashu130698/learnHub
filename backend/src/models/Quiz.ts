import mongoose, { Schema, Document } from "mongoose";

export interface IOption {
  id: string; // 'a', 'b', 'c', 'd'
  text: string;
}

export interface IQuestion {
  _id: mongoose.Types.ObjectId;
  text: string;
  type: "mcq" | "true_false" | "multi_select";
  options: IOption[];
  correctAnswers: string[]; // array of option IDs — ['a'] for MCQ, ['a','c'] for multi
  explanation: string; // revealed to user ONLY after quiz submission
  points: number;
}

export interface IQuiz extends Document {
  moduleId: mongoose.Types.ObjectId;
  title: string;
  passingScore: number; // percentage required to pass e.g. 70 = 70%
  questions: IQuestion[];
  createdAt: Date;
}

const questionSchema = new Schema<IQuestion>({
  text: { type: String, required: true },
  type: {
    type: String,
    enum: ["mcq", "true_false", "multi_select"],
    required: true,
  },
  options: [
    {
      id: { type: String, required: true }, // 'a', 'b', 'c', 'd'
      text: { type: String, required: true },
    },
  ],
  correctAnswers: [String], // e.g. ['b'] — stored server-side, NEVER sent to client
  explanation: { type: String, default: "" },
  points: { type: Number, default: 1, min: 1 },
});

const quizSchema = new Schema<IQuiz>(
  {
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "Module", // tells Mongoose this references the Module collection
      required: true,
      unique: true, // one quiz per module, enforced at DB level
    },
    title: { type: String, required: true },
    passingScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 70,
    },
    questions: [questionSchema],
  },
  { timestamps: true },
);

quizSchema.index({ moduleId: 1 }); // fast lookup: "get quiz for this module"

export const Quiz = mongoose.model<IQuiz>("Quiz", quizSchema);
