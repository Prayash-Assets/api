import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * DiscountApplication - Audit trail for all discounts applied at checkout
 * Records both package discounts and eligibility discounts
 */
export interface IDiscountApplication extends Document {
    purchase: Types.ObjectId;         // Reference to Purchase
    user: Types.ObjectId;

    // Layer 1: Package discount (informational, already in price)
    packageOriginalPrice: number;
    packageDiscountPercentage: number;
    packageDiscountedPrice: number;   // = displayPrice sent to this checkout

    // Layer 2: Eligibility discount (applied at checkout)
    eligibilityDiscountType: "group" | "organization" | "none";
    eligibilityDiscountSource: Types.ObjectId | null; // Group ID or Org ID
    eligibilityDiscountRule: Types.ObjectId | null;   // Reference to DiscountRule
    eligibilityDiscountPercentage: number;
    eligibilityDiscountAmount: number;

    // Final calculation
    finalPrice: number;
    totalSavings: number;             // originalPrice - finalPrice
    totalDiscountPercentage: number;  // Combined effective discount

    // Cap tracking
    floorPriceApplied: boolean;       // True if floor cap was hit
    cappedAt: number | null;          // If capped, what was the cap value

    // Validation timestamp
    validatedAt: Date;

    // Expiration info (copied at checkout time)
    discountExpiresAt: Date | null;

    // Metadata
    metadata: {
        groupMemberCount?: number;
        groupCode?: string;
        orgTier?: number;
        orgName?: string;
    };

    createdAt: Date;
}

const discountApplicationSchema = new Schema<IDiscountApplication>(
    {
        purchase: {
            type: Schema.Types.ObjectId,
            ref: "Purchase",
            required: true,
            unique: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        packageOriginalPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        packageDiscountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        packageDiscountedPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        eligibilityDiscountType: {
            type: String,
            enum: ["group", "organization", "none"],
            default: "none",
        },
        eligibilityDiscountSource: {
            type: Schema.Types.ObjectId,
            refPath: "eligibilityDiscountType",
            default: null,
        },
        eligibilityDiscountRule: {
            type: Schema.Types.ObjectId,
            ref: "DiscountRule",
            default: null,
        },
        eligibilityDiscountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        eligibilityDiscountAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        finalPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        totalSavings: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalDiscountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        floorPriceApplied: {
            type: Boolean,
            default: false,
        },
        cappedAt: {
            type: Number,
            default: null,
        },
        validatedAt: {
            type: Date,
            required: true,
        },
        discountExpiresAt: {
            type: Date,
            default: null,
        },
        metadata: {
            groupMemberCount: { type: Number },
            groupCode: { type: String },
            orgTier: { type: Number },
            orgName: { type: String },
        },
    },
    { timestamps: true }
);

// Indexes
discountApplicationSchema.index({ purchase: 1 }, { unique: true });
discountApplicationSchema.index({ user: 1, createdAt: -1 });
discountApplicationSchema.index({ eligibilityDiscountType: 1, createdAt: -1 });
discountApplicationSchema.index({ eligibilityDiscountSource: 1 });

export default mongoose.model<IDiscountApplication>("DiscountApplication", discountApplicationSchema);
