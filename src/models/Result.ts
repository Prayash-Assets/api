import { Document, Schema, model, Types } from "mongoose";
import { IMockTest } from "./MockTest";
import { IUser } from "./User";

export interface IResult extends Document {
  student: Types.ObjectId | IUser;
  mockTest: Types.ObjectId | IMockTest;
  package?: Types.ObjectId; // Track which package this test was taken from
  startTime: Date;
  endTime: Date;
  score: number;
  answers: {
    question: Types.ObjectId;
    answer: string | string[]; // Support multiple answer types
    correctAnswer?: string | string[]; // Store the correct answer for this question
    isCorrect: boolean;
    marks: number;
    timeTaken?: number; // Time spent on this question in seconds
  }[];
  totalMarks: number;
  isPassed: boolean;
  attemptNumber: number;
  timeTaken: number; // Total time taken in seconds
  correctAnswers: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  percentage: number;
  rank?: number;
  submissionType: "manual" | "auto"; // Whether submitted manually or auto-submitted
  detailedAnalysis?: {
    subjectWise: Record<
      string,
      {
        attempted: number;
        correct: number;
        total: number;
        percentage: number;
      }
    >;
    difficultyWise: Record<
      string,
      {
        attempted: number;
        correct: number;
        total: number;
        percentage: number;
      }
    >;
    categoryWise: Record<
      string,
      {
        attempted: number;
        correct: number;
        total: number;
        percentage: number;
      }
    >;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ResultSchema = new Schema<IResult>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mockTest: {
      type: Schema.Types.ObjectId,
      ref: "MockTest",
      required: true,
    },
    package: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: false,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    answers: [
      {
        question: {
          type: Schema.Types.ObjectId,
          ref: "Question",
          required: true,
        },
        answer: {
          type: Schema.Types.Mixed, // Support string or array
          required: true,
        },
        correctAnswer: {
          type: Schema.Types.Mixed, // Store the correct answer for this question
        },
        isCorrect: {
          type: Boolean,
          required: true,
        },
        marks: {
          type: Number,
          required: true,
        },
        timeTaken: {
          type: Number,
          default: 0,
        },
      },
    ],
    totalMarks: {
      type: Number,
      required: true,
    },
    isPassed: {
      type: Boolean,
      required: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
    },
    timeTaken: {
      type: Number,
      required: true,
    },
    correctAnswers: {
      type: Number,
      required: true,
    },
    incorrectAnswers: {
      type: Number,
      required: true,
    },
    unansweredQuestions: {
      type: Number,
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
    },
    rank: {
      type: Number,
    },
    submissionType: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
    detailedAnalysis: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Create indexes for better performance
// Remove old index and create new one with package field
ResultSchema.index(
  { student: 1, mockTest: 1, attemptNumber: 1 },
  { unique: false }
);
ResultSchema.index(
  { student: 1, mockTest: 1, package: 1, attemptNumber: 1 },
  { unique: true, sparse: true }
);
ResultSchema.index({ student: 1, createdAt: -1 });
ResultSchema.index({ mockTest: 1, createdAt: -1 });
ResultSchema.index({ score: -1 });

export const Result = model<IResult>("Result", ResultSchema);
