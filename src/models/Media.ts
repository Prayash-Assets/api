import mongoose, { Document, Schema } from "mongoose";

export interface IMedia extends Document {
  filename: string;
  originalName: string;
  name?: string; // For frontend compatibility
  url?: string; // For frontend compatibility
  size: number;
  type?: string; // For frontend compatibility (alias for mimetype)
  category?: "document" | "image" | "video" | "other"; // For frontend compatibility
  mimetype: string;
  filePath?: string; // Local file path (optional for backward compatibility)
  s3Key?: string; // S3 object key
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt?: Date; // Make optional since we have timestamps
  uploadDate?: Date; // For frontend compatibility
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    pages?: number;
    fileExtension?: string;
    originalSize?: number;
    [key: string]: any;
  };
}

const MediaSchema: Schema = new Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ["document", "image", "video", "other"],
      default: "document",
    },
    mimetype: {
      type: String,
      required: true,
      trim: true,
    },
    filePath: {
      type: String,
      trim: true,
    },
    s3Key: {
      type: String,
      trim: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for better query performance
MediaSchema.index({ uploadedBy: 1 });
MediaSchema.index({ uploadedAt: -1 });
MediaSchema.index({ uploadDate: -1 });
MediaSchema.index({ mimetype: 1 });
MediaSchema.index({ category: 1 });

export const Media = mongoose.model<IMedia>("Media", MediaSchema);
