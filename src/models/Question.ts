import { Document, Schema, model } from "mongoose";
import { ICategory } from "./Category";
import { ISubject } from "./Subject";
import { ILevel } from "./Level";

export enum DifficultyLevel {
  EASY = "Easy",
  MEDIUM = "Medium",
  HARD = "Hard",
}

export interface IQuestion extends Document {
  text: string;
  options: { optionText: string; isCorrect: boolean }[];
  correct_answer?: string;
  difficulty: DifficultyLevel;
  category_id: ICategory["_id"];
  subject_id: ISubject["_id"];
  level_id: ILevel["_id"];
  explanation?: string;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    text: { type: String, required: true },
    options: [
      {
        optionText: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
      },
    ],
    correct_answer: { type: String, required: false }, // This can be derived from options
    difficulty: {
      type: String,
      enum: Object.values(DifficultyLevel),
      required: true,
    },
    category_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subject_id: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    level_id: { type: Schema.Types.ObjectId, ref: "Level", required: true },
    explanation: { type: String },
  },
  { timestamps: true }
);

export const Question = model<IQuestion>("Question", QuestionSchema);
