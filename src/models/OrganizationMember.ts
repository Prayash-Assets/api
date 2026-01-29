import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * OrganizationMember - Students associated with an organization
 * Tracks invitations, registration status, and purchase history
 */
export interface IOrganizationMember extends Document {
    organization: Types.ObjectId;     // Reference to Organization
    user: Types.ObjectId | null;      // Reference to User (null if not registered)

    // Student details
    email: string;
    name: string;
    employeeId: string | null;        // Optional org-specific ID
    department: string | null;

    // Invitation tracking
    inviteToken: string | null;
    inviteExpiresAt: Date | null;

    // Onboarding verification
    verificationCode: string | null;
    verificationExpiry: Date | null;
    pendingPhone: number | null;

    // Status
    status: "invited" | "registered" | "active" | "removed";
    joinedAt: Date | null;
    removedAt: Date | null;
    removedReason: string | null;

    // Purchase tracking (denormalized for dashboard performance)
    lastPurchaseAt: Date | null;
    totalPurchases: number;
    totalSpent: number;

    createdAt: Date;
    updatedAt: Date;
}

const organizationMemberSchema = new Schema<IOrganizationMember>(
    {
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        employeeId: {
            type: String,
            trim: true,
            default: null,
        },
        department: {
            type: String,
            trim: true,
            default: null,
        },
        inviteToken: {
            type: String,
            default: null,
        },
        inviteExpiresAt: {
            type: Date,
            default: null,
        },
        // Onboarding verification fields
        verificationCode: {
            type: String,
            default: null,
        },
        verificationExpiry: {
            type: Date,
            default: null,
        },
        pendingPhone: {
            type: Number,
            default: null,
        },
        status: {
            type: String,
            enum: ["invited", "registered", "active", "removed"],
            default: "invited",
        },
        joinedAt: {
            type: Date,
            default: null,
        },
        removedAt: {
            type: Date,
            default: null,
        },
        removedReason: {
            type: String,
            default: null,
        },
        lastPurchaseAt: {
            type: Date,
            default: null,
        },
        totalPurchases: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalSpent: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

// Indexes
organizationMemberSchema.index({ organization: 1, status: 1 });
organizationMemberSchema.index({ email: 1, organization: 1 }, { unique: true });
organizationMemberSchema.index({ user: 1 });
organizationMemberSchema.index({ inviteToken: 1 });
organizationMemberSchema.index({ organization: 1, totalSpent: -1 }); // For top performers

// Generate invite token
organizationMemberSchema.statics.generateInviteToken = function (): string {
    const bytes = new Array(24);
    for (let i = 0; i < 24; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return "org_" + bytes.map(b => b.toString(16).padStart(2, "0")).join("");
};

// Check if invite is valid
organizationMemberSchema.methods.isInviteValid = function (): boolean {
    if (this.status !== "invited") return false;
    if (!this.inviteToken) return false;
    if (this.inviteExpiresAt && this.inviteExpiresAt < new Date()) return false;
    return true;
};

export default mongoose.model<IOrganizationMember>("OrganizationMember", organizationMemberSchema);
