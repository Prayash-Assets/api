import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Organization - Educational institutions and coaching centers
 * For B2B partnerships with commission-based revenue sharing
 */
export interface IOrganization extends Document {
    name: string;
    type: "coaching" | "school" | "college" | "corporate";

    // Registration details
    registrationNumber: string;
    gstin: string | null;

    // Address
    address: {
        street: string;
        city: string;
        state: string;
        pincode: string;
    };

    // Contact person
    contactPerson: {
        name: string;
        email: string;
        phone: string;
    };

    // Verification documents (S3 URLs)
    documents: {
        registrationCert: string | null;
        gstCert: string | null;
        addressProof: string | null;
        signatoryProof: string | null;
    };

    // Bank details for commission payments
    bankDetails: {
        accountName: string | null;
        accountNumber: string | null;
        ifscCode: string | null;
        bankName: string | null;
    };

    // Tier and discount settings
    tier: number;                     // 1-4
    seatCount: number;                // Allocated seats
    discountPercentage: number;       // Based on tier
    commissionRate: number;           // 5-10% of student purchases

    // Verification status
    status: "pending" | "verified" | "rejected" | "suspended";
    verifiedBy: Types.ObjectId | null;
    verifiedAt: Date | null;
    rejectionReason: string | null;

    // Email verification
    emailVerificationCode: string | null;
    emailVerificationExpiry: Date | null;
    isEmailVerified: boolean;

    // Temporary password storage for user creation
    pendingUserPassword: string | null;

    // Admin user for this organization
    adminUser: Types.ObjectId | null;

    createdAt: Date;
    updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: ["coaching", "school", "college", "corporate"],
            required: true,
        },
        registrationNumber: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        gstin: {
            type: String,
            trim: true,
            default: null,
        },
        address: {
            street: { type: String, trim: true, default: "" },
            city: { type: String, trim: true, default: "" },
            state: { type: String, trim: true, default: "" },
            pincode: { type: String, trim: true, default: "" },
        },
        contactPerson: {
            name: { type: String, required: true, trim: true },
            email: { type: String, required: true, trim: true, lowercase: true },
            phone: { type: String, required: true, trim: true },
        },
        documents: {
            registrationCert: { type: String, default: null },
            gstCert: { type: String, default: null },
            addressProof: { type: String, default: null },
            signatoryProof: { type: String, default: null },
        },
        bankDetails: {
            accountName: { type: String, default: null },
            accountNumber: { type: String, default: null },
            ifscCode: { type: String, default: null },
            bankName: { type: String, default: null },
        },
        tier: {
            type: Number,
            default: 1,
            min: 1,
            max: 4,
        },
        seatCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        discountPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        commissionRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        status: {
            type: String,
            enum: ["pending", "verified", "rejected", "suspended"],
            default: "pending",
        },
        verifiedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        verifiedAt: {
            type: Date,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
        },
        emailVerificationCode: {
            type: String,
            default: null,
        },
        emailVerificationExpiry: {
            type: Date,
            default: null,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        pendingUserPassword: {
            type: String,
            default: null,
            select: false, // Don't include in normal queries
        },
        adminUser: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes (unique index for registrationNumber is created by unique: true in schema)
organizationSchema.index({ status: 1 });
organizationSchema.index({ "contactPerson.email": 1 }, { unique: true });
organizationSchema.index({ adminUser: 1 });
organizationSchema.index({ tier: 1, status: 1 });

export default mongoose.model<IOrganization>("Organization", organizationSchema);
