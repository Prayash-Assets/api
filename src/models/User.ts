import mongoose, { Schema, Document, Types } from "mongoose";
import { IRole } from "./Role"; // Assuming Role.ts is in the same directory

// Base User interface
export interface IUser extends Document {
  fullname: string;

  email: string;
  password?: string; // Optional because it will be hashed and may not always be present in returned documents
  phone?: number; // Optional field for phone number
  roles: Types.ObjectId[] | IRole[]; // Array of Role ObjectIds or populated IRole objects
  userType: "Student" | "Admin" | "OrgAdmin"; // Discriminator key
  // Email verification fields
  verificationCode?: string;
  verificationExpiry?: Date;
  isVerified: boolean;
  verificationAttempts?: number;
  lastCodeSentAt?: Date;
  // Session management for single device login
  activeSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Password reset fields
  passwordResetCode?: string;
  passwordResetExpiry?: Date;
}

// Student interface extending base User
export interface IStudent extends IUser {
  userType: "Student";
  city?: string;
  state?: string;
  education?: string;
  school?: string; // School / College / University
  packages?: Types.ObjectId[]; // Array of purchased package IDs
  // Discount module fields
  organization?: Types.ObjectId;    // Organization membership (null if not org member)
  studyGroup?: Types.ObjectId;      // Active study group (null if none)
  // Referral module fields
  referralCode?: string;            // Unique 8-character alphanumeric referral code
  referralCount?: number;           // Number of successful referrals made
  referralCredits?: number;         // Accumulated referral credits (in INR)
  referredBy?: Types.ObjectId;      // User who referred this student (null if none)
}

// Admin interface extending base User
export interface IAdmin extends IUser {
  userType: "Admin";
  phone: number; // Required for Admin
  address?: string;
}

// OrgAdmin interface extending base User (Organization Administrators)
export interface IOrgAdmin extends IUser {
  userType: "OrgAdmin";
  organization: Types.ObjectId; // The organization they administer
}

// Base User schema with common fields
const baseUserSchema: Schema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },

    phone: {
      type: Number,
      sparse: true, // Allows for null values without creating a unique constraint violation
    },
    roles: [
      {
        type: Schema.Types.ObjectId,
        ref: "Role",
      },
    ],
    // Email verification fields
    verificationCode: {
      type: String,
      sparse: true, // Allows for null values
    },
    verificationExpiry: {
      type: Date,
      sparse: true, // Allows for null values
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationAttempts: {
      type: Number,
      default: 0,
    },
    lastCodeSentAt: {
      type: Date,
      sparse: true, // Allows for null values
    },
    // Session management for single device login
    activeSessionId: {
      type: String,
      sparse: true, // Allows for null values
    },
    // Password reset fields
    passwordResetCode: {
      type: String,
      sparse: true,
    },
    passwordResetExpiry: {
      type: Date,
      sparse: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically
    discriminatorKey: "userType", // Field to distinguish between user types
  }
);

// Base User model
const User = mongoose.model<IUser>("User", baseUserSchema);

// Student discriminator schema
const studentSchema = new Schema<IStudent>({
  city: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  education: {
    type: String,
    trim: true,
  },
  school: {
    type: String,
    trim: true,
  },
  packages: [
    {
      type: Schema.Types.ObjectId,
      ref: "Package",
    },
  ],
  // Discount module fields (optional, null for existing students)
  organization: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    default: null,
  },
  studyGroup: {
    type: Schema.Types.ObjectId,
    ref: "StudyGroup",
    default: null,
  },
  // Referral module fields
  referralCode: {
    type: String,
    uppercase: true,
    trim: true,
    unique: true,
    sparse: true, // Allows null/undefined values
  },
  referralCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  referralCredits: {
    type: Number,
    default: 0,
    min: 0,
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

// Admin discriminator schema
const adminSchema = new Schema<IAdmin>({
  phone: {
    type: Number,
    required: true, // Required for Admin users
  },
  address: {
    type: String,
    trim: true,
  },
});

// OrgAdmin discriminator schema
const orgAdminSchema = new Schema<IOrgAdmin>({
  organization: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
  },
});

// Create discriminator models
export const Student = User.discriminator<IStudent>("Student", studentSchema);
export const Admin = User.discriminator<IAdmin>("Admin", adminSchema);
export const OrgAdmin = User.discriminator<IOrgAdmin>("OrgAdmin", orgAdminSchema);

// Export the base User model as default
export default User;
