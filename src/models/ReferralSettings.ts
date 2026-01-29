import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * ReferralSettings - Admin-configurable referral discount settings
 * Singleton document - only one settings document exists
 */
export interface IReferralSettings extends Document {
    discountType: "percentage" | "flat";    // Type of discount to apply
    referrerBenefit: number;                // What referrer gets (% or INR based on type)
    refereeBenefit: number;                 // What referee gets (% or INR based on type)
    isActive: boolean;                      // Enable/disable referral program
    maxUsagePerCode: number | null;         // Max times a single code can be used (null = unlimited)
    validityDays: number | null;            // Days until referral expires (null = never)
    minPurchaseAmount: number;              // Minimum purchase amount to apply referral
    updatedBy: Types.ObjectId;              // Last admin who updated settings
    createdAt: Date;
    updatedAt: Date;
}

const referralSettingsSchema = new Schema<IReferralSettings>(
    {
        discountType: {
            type: String,
            enum: ["percentage", "flat"],
            default: "flat",
            required: true,
        },
        referrerBenefit: {
            type: Number,
            default: 100,
            min: 0,
            required: true,
        },
        refereeBenefit: {
            type: Number,
            default: 10,
            min: 0,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        maxUsagePerCode: {
            type: Number,
            default: null,
            min: 1,
        },
        validityDays: {
            type: Number,
            default: null,
            min: 1,
        },
        minPurchaseAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

// Ensure only one settings document exists (singleton pattern)
referralSettingsSchema.statics.getSettings = async function (): Promise<IReferralSettings | null> {
    return await this.findOne().populate("updatedBy", "fullname email");
};

referralSettingsSchema.statics.updateSettings = async function (
    updates: Partial<IReferralSettings>,
    adminId: Types.ObjectId
): Promise<IReferralSettings> {
    const settings = await this.findOne();
    if (settings) {
        Object.assign(settings, updates, { updatedBy: adminId });
        return await settings.save();
    } else {
        return await this.create({ ...updates, updatedBy: adminId });
    }
};

export default mongoose.model<IReferralSettings>("ReferralSettings", referralSettingsSchema);
