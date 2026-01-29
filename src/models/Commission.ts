import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Commission - Revenue share tracking for organizations
 * Calculated periodically (daily, weekly, monthly)
 */
export interface ICommission extends Document {
    organization: Types.ObjectId;     // Reference to Organization

    // Period details
    period: {
        startDate: Date;
        endDate: Date;
        type: "daily" | "weekly" | "monthly";
    };

    // Purchase breakdown
    purchases: Array<{
        purchase: Types.ObjectId;
        user: Types.ObjectId;
        studentName: string;
        packageName: string;
        amount: number;
        commission: number;
        purchaseDate: Date;
    }>;

    // Summary metrics
    totalSales: number;
    purchaseCount: number;
    commissionRate: number;           // Rate used for this period
    baseCommission: number;
    bonusCommission: number;
    totalCommission: number;
    minimumGuarantee: number;
    finalAmount: number;              // Max of totalCommission or guarantee

    // Payment status - overall status (deprecated in favor of payouts)
    status: "pending" | "processed" | "paid" | "disputed";

    // Individual payouts for each purchase/batch
    payouts: Array<{
        _id: Types.ObjectId;
        purchaseId: Types.ObjectId;
        amount: number;
        status: "pending" | "paid" | "disputed";
        transactionId: string | null;
        paidAt: Date | null;
        paymentMethod: string | null;
        notes: string | null;
        createdAt: Date;
    }>;

    // Legacy payment details (kept for backward compatibility)
    paymentDetails: {
        transactionId: string | null;
        paidAt: Date | null;
        paymentMethod: string | null;
        notes: string | null;
    };

    // Audit
    calculatedAt: Date;
    calculatedBy: Types.ObjectId | null;  // Admin or "system"
    processedBy: Types.ObjectId | null;
    processedAt: Date | null;

    createdAt: Date;
    updatedAt: Date;
}

const commissionSchema = new Schema<ICommission>(
    {
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        period: {
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true },
            type: {
                type: String,
                enum: ["daily", "weekly", "monthly"],
                required: true
            },
        },
        purchases: [{
            purchase: { type: Schema.Types.ObjectId, ref: "Purchase" },
            user: { type: Schema.Types.ObjectId, ref: "User" },
            studentName: { type: String },
            packageName: { type: String },
            amount: { type: Number },
            commission: { type: Number },
            purchaseDate: { type: Date },
        }],
        totalSales: {
            type: Number,
            default: 0,
            min: 0,
        },
        purchaseCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        commissionRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        baseCommission: {
            type: Number,
            default: 0,
            min: 0,
        },
        bonusCommission: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalCommission: {
            type: Number,
            default: 0,
            min: 0,
        },
        minimumGuarantee: {
            type: Number,
            default: 0,
            min: 0,
        },
        finalAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        status: {
            type: String,
            enum: ["pending", "processed", "paid", "disputed"],
            default: "pending",
        },
        payouts: [{
            purchaseId: {
                type: Schema.Types.ObjectId,
                ref: "Purchase",
            },
            amount: {
                type: Number,
                required: true,
                min: 0,
            },
            status: {
                type: String,
                enum: ["pending", "paid", "disputed"],
                default: "pending",
            },
            transactionId: {
                type: String,
                default: null,
            },
            paidAt: {
                type: Date,
                default: null,
            },
            paymentMethod: {
                type: String,
                default: null,
            },
            notes: {
                type: String,
                default: null,
            },
            createdAt: {
                type: Date,
                default: Date.now,
            },
        }],
        paymentDetails: {
            transactionId: { type: String, default: null },
            paidAt: { type: Date, default: null },
            paymentMethod: { type: String, default: null },
            notes: { type: String, default: null },
        },
        calculatedAt: {
            type: Date,
            required: true,
        },
        calculatedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        processedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        processedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes
commissionSchema.index({ organization: 1, "period.startDate": -1 });
commissionSchema.index({ status: 1 });
commissionSchema.index({ "period.type": 1, "period.endDate": 1 });
commissionSchema.index({ organization: 1, status: 1 });
commissionSchema.index({ "purchases.purchase": 1 }); // Index for purchase lookup

// NOTE: Removed unique compound index to allow per-purchase commission records
// Each purchase now creates its own commission record for tracking individual payouts

export default mongoose.model<ICommission>("Commission", commissionSchema);
