import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * ReferralSettingsAudit - Audit log for changes to referral settings
 * Tracks all admin modifications to referral configuration
 */
export interface IReferralSettingsAudit extends Document {
    adminId: Types.ObjectId;                // Admin who made the change
    adminName: string;                      // Cached admin name for historical reference
    adminEmail: string;                     // Cached admin email
    action: "create" | "update" | "toggle"; // Type of change
    previousSettings: Record<string, any>;  // Settings before change
    newSettings: Record<string, any>;       // Settings after change
    changedFields: string[];                // List of fields that changed
    ipAddress?: string;                     // IP address of the request
    userAgent?: string;                     // Browser/client info
    createdAt: Date;
}

const referralSettingsAuditSchema = new Schema<IReferralSettingsAudit>(
    {
        adminId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        adminName: {
            type: String,
            required: true,
            trim: true,
        },
        adminEmail: {
            type: String,
            required: true,
            trim: true,
        },
        action: {
            type: String,
            enum: ["create", "update", "toggle"],
            required: true,
        },
        previousSettings: {
            type: Schema.Types.Mixed,
            default: {},
        },
        newSettings: {
            type: Schema.Types.Mixed,
            required: true,
        },
        changedFields: [{
            type: String,
        }],
        ipAddress: {
            type: String,
            trim: true,
        },
        userAgent: {
            type: String,
            trim: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for efficient querying
referralSettingsAuditSchema.index({ createdAt: -1 });
referralSettingsAuditSchema.index({ adminId: 1, createdAt: -1 });
referralSettingsAuditSchema.index({ action: 1 });

export default mongoose.model<IReferralSettingsAudit>("ReferralSettingsAudit", referralSettingsAuditSchema);
