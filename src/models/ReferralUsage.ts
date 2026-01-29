import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * ReferralUsage - Tracks each use of a referral code
 * Records both referrer and referee benefits
 */
export interface IReferralUsage extends Document {
    referralCode: string;                   // The code that was used
    referrer: Types.ObjectId;               // User who owns the code (referrer)
    referee: Types.ObjectId;                // User who used the code (new customer)
    purchase: Types.ObjectId;               // Associated purchase

    // Benefit details
    benefitType: "percentage" | "flat";     // Type of benefit applied
    referrerBenefitValue: number;           // Percentage or flat amount for referrer
    refereeBenefitValue: number;            // Percentage or flat amount for referee
    referrerCreditAmount: number;           // Actual amount credited to referrer (INR)
    refereeDiscountAmount: number;          // Actual amount discounted for referee (INR)

    // Purchase context
    purchaseAmount: number;                 // Original purchase amount
    finalPurchaseAmount: number;            // Amount after referral discount

    // Status tracking
    status: "pending" | "completed" | "failed" | "expired" | "cancelled";
    completedAt: Date | null;
    failureReason?: string;

    createdAt: Date;
    updatedAt: Date;
}

const referralUsageSchema = new Schema<IReferralUsage>(
    {
        referralCode: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            index: true,
        },
        referrer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        referee: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        purchase: {
            type: Schema.Types.ObjectId,
            ref: "Purchase",
            required: true,
        },
        benefitType: {
            type: String,
            enum: ["percentage", "flat"],
            required: true,
        },
        referrerBenefitValue: {
            type: Number,
            required: true,
            min: 0,
        },
        refereeBenefitValue: {
            type: Number,
            required: true,
            min: 0,
        },
        referrerCreditAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        refereeDiscountAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        purchaseAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        finalPurchaseAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ["pending", "completed", "failed", "expired", "cancelled"],
            default: "pending",
        },
        completedAt: {
            type: Date,
            default: null,
        },
        failureReason: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true }
);

// Indexes for efficient querying
referralUsageSchema.index({ referrer: 1, status: 1 });
referralUsageSchema.index({ referee: 1 });
referralUsageSchema.index({ purchase: 1 }, { unique: true });
referralUsageSchema.index({ createdAt: -1 });
referralUsageSchema.index({ status: 1, createdAt: -1 });

// Prevent same referee from using same referrer's code multiple times
referralUsageSchema.index(
    { referrer: 1, referee: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: ["pending", "completed"] } }
    }
);

export default mongoose.model<IReferralUsage>("ReferralUsage", referralUsageSchema);
