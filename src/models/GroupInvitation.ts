import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * GroupInvitation - Tracks email invitations to join study groups
 */
export interface IGroupInvitation extends Document {
    group: Types.ObjectId;            // Reference to StudyGroup
    invitedBy: Types.ObjectId;        // User who sent the invite
    inviteeEmail: string;             // Email address of invitee
    token: string;                    // Unique token for invite link

    // Status tracking
    status: "pending" | "accepted" | "expired" | "cancelled";
    expiresAt: Date;                  // 7 days from creation by default
    acceptedAt: Date | null;
    acceptedBy: Types.ObjectId | null; // User who accepted (after registration)

    createdAt: Date;
    updatedAt: Date;

    // Methods
    isValid(): boolean;
}

const groupInvitationSchema = new Schema<IGroupInvitation>(
    {
        group: {
            type: Schema.Types.ObjectId,
            ref: "StudyGroup",
            required: true,
        },
        invitedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        inviteeEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        token: {
            type: String,
            required: true,
            unique: true,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "expired", "cancelled"],
            default: "pending",
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        acceptedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes (unique index for token is created by unique: true in schema)
groupInvitationSchema.index({ group: 1, status: 1 });
groupInvitationSchema.index({ inviteeEmail: 1, status: 1 });
groupInvitationSchema.index({ expiresAt: 1 }); // For TTL queries

// Generate unique invitation token
groupInvitationSchema.statics.generateToken = function (): string {
    const bytes = new Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
};

// Check if invitation is valid
groupInvitationSchema.methods.isValid = function (): boolean {
    if (this.status !== "pending") return false;
    if (this.expiresAt < new Date()) return false;
    return true;
};

export default mongoose.model<IGroupInvitation>("GroupInvitation", groupInvitationSchema);
