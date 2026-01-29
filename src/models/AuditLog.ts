import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAuditLog extends Document {
    action: string;
    performedBy: Types.ObjectId;
    targetEntity: string;
    targetId: Types.ObjectId;
    details?: Record<string, any>;
    organization: Types.ObjectId;
    createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
    {
        action: {
            type: String,
            required: true,
            trim: true,
        },
        performedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        targetEntity: {
            type: String,
            required: true,
            trim: true,
        },
        targetId: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        details: {
            type: Schema.Types.Mixed,
            default: {},
        },
        organization: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes for faster querying
auditLogSchema.index({ organization: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ action: 1 });

export default mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
