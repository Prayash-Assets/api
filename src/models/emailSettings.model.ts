import mongoose, { Document, Model, Schema } from "mongoose";

// Interface for TypeScript
export interface IEmailSettings extends Document {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const emailSettingsSchema = new Schema<IEmailSettings>(
  {
    smtpHost: {
      type: String,
      required: [true, "SMTP host is required"],
    },
    smtpPort: {
      type: Number,
      required: [true, "SMTP port is required"],
      min: [1, "Port must be at least 1"],
      max: [65535, "Port cannot exceed 65535"],
    },
    smtpUser: {
      type: String,
      required: [true, "SMTP user is required"],
    },
    smtpPassword: {
      type: String,
      required: [true, "SMTP password is required"],
      select: false, // Don't return this field by default
    },
    smtpSecure: {
      type: Boolean,
      default: false,
    },
    fromEmail: {
      type: String,
      required: [true, "From email is required"],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please enter a valid email address",
      ],
    },
    fromName: {
      type: String,
      required: [true, "From name is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "email_settings",
  }
);

// Create and export the model
const EmailSettings: Model<IEmailSettings> =
  mongoose.models.EmailSettings ||
  mongoose.model<IEmailSettings>("EmailSettings", emailSettingsSchema);

export default EmailSettings;
