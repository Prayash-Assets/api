import { Document, Schema, model } from "mongoose";
import { IQuestion } from "./Question";

export enum MockTestStatus {
  DRAFT = "Draft",
  PUBLISHED = "Published",
  ARCHIVED = "Archived",
}

export enum TestType {
  STUDY_TEST = "Study Test",
  MOCK_TEST = "Mock Test",
}

export interface IMockTest extends Document {
  title: string;
  description?: string;
  questions: IQuestion["_id"][];
  duration: number; // in minutes
  numberOfQuestions: number; // New field for dynamic total marks calculation
  totalMarks: number;
  passingMarks: number;
  status: MockTestStatus;
  testType: TestType; // New field for test type
  numberOfAttempts: number; // New field
  marksPerQuestion: number; // New field
  negativeMarking?: number; // New field (optional, defaults to 0)
  // createdBy: IUser["_id"]; // Optional: if you want to track who created the mock test
}

const MockTestSchema = new Schema<IMockTest>(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String },
    questions: [
      { type: Schema.Types.ObjectId, ref: "Question", required: true },
    ],
    duration: { type: Number, required: true }, // Duration in minutes
    numberOfQuestions: { type: Number, required: true }, // New field for question count
    totalMarks: { type: Number, required: true },
    passingMarks: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(MockTestStatus),
      default: MockTestStatus.DRAFT,
      required: true,
    },
    testType: {
      type: String,
      enum: Object.values(TestType),
      default: TestType.MOCK_TEST,
      required: true,
    },
    numberOfAttempts: { type: Number, required: true, default: 1 }, // New field
    marksPerQuestion: { type: Number, required: true }, // New field
    negativeMarking: { type: Number, default: 0 }, // New field
    // createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const MockTest = model<IMockTest>("MockTest", MockTestSchema);
