import { Document, Schema, model, Types } from "mongoose";
import { IUser } from "./User";
import { IPackage } from "./Package";

export interface IPurchase extends Document {
  user: IUser["_id"];
  package: IPackage["_id"];
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature?: string;
  amount: number;
  currency: string;
  status:
  | "created"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "cancelled";
  orderDetails: {
    packageName: string;
    packageDescription?: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
  };
  // Discount tracking (optional - null for pre-discount purchases)
  discountApplication?: Types.ObjectId;
  // Referral tracking (optional - null if no referral code used)
  referralUsage?: Types.ObjectId;
  paymentMethod?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    package: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    razorpayPaymentId: { type: String, default: null },
    razorpayOrderId: { type: String, required: true }, // Removed unique: true to prevent duplicate index
    razorpaySignature: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "INR" },
    status: {
      type: String,
      enum: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
        "cancelled",
      ],
      default: "created",
      required: true,
    },
    orderDetails: {
      packageName: { type: String, required: true },
      packageDescription: { type: String },
      customerEmail: { type: String, required: true },
      customerName: { type: String, required: true },
      customerPhone: { type: String },
    },
    paymentMethod: { type: String },
    failureReason: { type: String },
    // Discount audit trail reference (null for pre-discount purchases)
    discountApplication: {
      type: Schema.Types.ObjectId,
      ref: "DiscountApplication",
      default: null
    },
    // Referral usage reference (null if no referral code was used)
    referralUsage: {
      type: Schema.Types.ObjectId,
      ref: "ReferralUsage",
      default: null
    },
  },
  { timestamps: true }
);

// Create indexes for better performance and prevent duplicate active orders
PurchaseSchema.index({ user: 1, package: 1, status: 1 });
PurchaseSchema.index({ razorpayOrderId: 1 }, { unique: true }); // Single unique index declaration
PurchaseSchema.index({ user: 1, createdAt: -1 });
PurchaseSchema.index({ status: 1, createdAt: -1 });

// Compound index to prevent multiple active orders for same user-package
PurchaseSchema.index(
  { user: 1, package: 1 },
  {
    partialFilterExpression: {
      status: { $in: ["created", "authorized"] },
    },
  }
);

export default model<IPurchase>("Purchase", PurchaseSchema);
