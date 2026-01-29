import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * StudyGroup - Student study groups for group discounts
 * Tracks membership, eligibility, and discount tiers
 */
export interface IStudyGroup extends Document {
    name: string;
    code: string;                     // Unique shareable code (e.g., GRP-ABC-XYZ)
    leader: Types.ObjectId;           // Group creator/leader
    members: Types.ObjectId[];        // Array of member user IDs
    memberCount: number;              // Denormalized for performance

    // Eligibility (automatically calculated)
    isEligible: boolean;              // True when memberCount >= minThreshold
    eligibilityDate: Date | null;     // When group became eligible
    discountTier: number | null;      // Current tier (1-4)
    discountPercentage: number;       // Current discount (0-25%)

    // Expiration
    discountExpiresAt: Date | null;   // Optional expiration for group discount

    // Status
    status: "active" | "archived" | "expired";

    createdAt: Date;
    updatedAt: Date;

    // Methods
    isDiscountValid(): boolean;
}

const studyGroupSchema = new Schema<IStudyGroup>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        leader: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        members: [{
            type: Schema.Types.ObjectId,
            ref: "User",
        }],
        memberCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        isEligible: {
            type: Boolean,
            default: false,
        },
        eligibilityDate: {
            type: Date,
            default: null,
        },
        discountTier: {
            type: Number,
            default: null,
            min: 1,
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        discountExpiresAt: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "archived", "expired"],
            default: "active",
        },
    },
    { timestamps: true }
);

// Indexes (unique indexes are already created by unique: true in schema)
studyGroupSchema.index({ leader: 1 });
studyGroupSchema.index({ members: 1 });
studyGroupSchema.index({ isEligible: 1, status: 1 });
studyGroupSchema.index({ status: 1, createdAt: -1 });

// Generate unique group code
studyGroupSchema.statics.generateCode = function (): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluding similar chars
    let code = "GRP-";
    for (let i = 0; i < 3; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += "-";
    for (let i = 0; i < 3; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Check if discount is valid (not expired)
studyGroupSchema.methods.isDiscountValid = function (): boolean {
    if (!this.isEligible) return false;
    if (this.status !== "active") return false;
    if (this.discountExpiresAt && this.discountExpiresAt < new Date()) return false;
    return true;
};

// Pre-save middleware to update memberCount
studyGroupSchema.pre("save", function (next) {
    this.memberCount = this.members.length;
    next();
});

export default mongoose.model<IStudyGroup>("StudyGroup", studyGroupSchema);
