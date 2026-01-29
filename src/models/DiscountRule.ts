import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * DiscountRule - Admin-configurable discount tiers
 * Supports group-based and organization-based discounts
 */
export interface IDiscountRule extends Document {
    name: string;
    type: "group" | "organization";
    tier: number;

    // Thresholds (admin configurable)
    minThreshold: number;           // Min members/seats to qualify
    maxThreshold: number | null;    // Max (null = unlimited)

    // Discount settings
    discountPercentage: number;     // 0-100

    // Expiration
    expiresAt: Date | null;         // Rule expiration (null = never)

    // Status
    isActive: boolean;
    priority: number;               // For conflict resolution (higher = more priority)

    // Audit
    createdBy: Types.ObjectId;
    updatedBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const discountRuleSchema = new Schema<IDiscountRule>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ["group", "organization"],
            required: true,
        },
        tier: {
            type: Number,
            required: true,
            min: 1,
        },
        minThreshold: {
            type: Number,
            required: true,
            min: 1,
        },
        maxThreshold: {
            type: Number,
            default: null,
            min: 1,
        },
        discountPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        priority: {
            type: Number,
            default: 0,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for efficient querying
discountRuleSchema.index({ type: 1, isActive: 1 });
discountRuleSchema.index({ type: 1, tier: 1 }, { unique: true });
discountRuleSchema.index({ priority: -1 });
discountRuleSchema.index({ expiresAt: 1 });

// Method to check if rule is valid (not expired)
discountRuleSchema.methods.isValid = function (): boolean {
    if (!this.isActive) return false;
    if (this.expiresAt && this.expiresAt < new Date()) return false;
    return true;
};

// Static method to get applicable rule for a count
discountRuleSchema.statics.getApplicableRule = async function (
    type: "group" | "organization",
    count: number
): Promise<IDiscountRule | null> {
    return await this.findOne({
        type,
        isActive: true,
        minThreshold: { $lte: count },
        $and: [
            {
                $or: [
                    { maxThreshold: null },
                    { maxThreshold: { $gte: count } }
                ]
            },
            {
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            }
        ]
    })
        .sort({ discountPercentage: -1, priority: -1 })
        .exec();
};

export default mongoose.model<IDiscountRule>("DiscountRule", discountRuleSchema);
