import { FastifyRequest, FastifyReply } from "fastify";
import ReferralSettings, { IReferralSettings } from "../models/ReferralSettings";
import ReferralSettingsAudit from "../models/ReferralSettingsAudit";
import User from "../models/User";

/**
 * Referral Settings Controller
 * Admin operations for configuring referral program
 */

export interface UpdateSettingsBody {
    discountType?: "percentage" | "flat";
    referrerBenefit?: number;
    refereeBenefit?: number;
    isActive?: boolean;
    maxUsagePerCode?: number | null;
    validityDays?: number | null;
    minPurchaseAmount?: number;
}

export interface AuditQueryParams {
    page?: string;
    limit?: string;
}

/**
 * Get current referral settings
 */
export const getReferralSettings = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        let settings = await ReferralSettings.findOne()
            .populate("updatedBy", "fullname email");

        // If no settings exist, return defaults
        if (!settings) {
            return reply.status(200).send({
                settings: {
                    discountType: "flat",
                    referrerBenefit: 100,
                    refereeBenefit: 10,
                    isActive: true,
                    maxUsagePerCode: null,
                    validityDays: null,
                    minPurchaseAmount: 0,
                    descriptionNote: "Referrer gets ₹100 per successful referral. Referee gets 10% discount on their purchase."
                },
                isConfigured: false
            });
        }

        return reply.status(200).send({
            settings: {
                ...settings.toObject(),
                descriptionNote: `Referrer gets ${settings.discountType === 'flat' ? `₹${settings.referrerBenefit}` : `${settings.referrerBenefit}% of purchase amount`} per successful referral. Referee gets ${settings.discountType === 'flat' ? `₹${settings.refereeBenefit}` : `${settings.refereeBenefit}% discount`} on their purchase.`
            },
            isConfigured: true
        });
    } catch (error) {
        console.error("Error getting referral settings:", error);
        reply.status(500).send({ message: "Failed to get referral settings", error });
    }
};

/**
 * Update referral settings (Admin only)
 */
export const updateReferralSettings = async (
    req: FastifyRequest<{ Body: UpdateSettingsBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const updates = req.body;

        // Get admin info for audit
        const admin = await User.findById(userId);
        if (!admin) {
            return reply.status(404).send({ message: "Admin user not found" });
        }

        // Validate discount type and values
        if (updates.discountType === "percentage") {
            if (updates.referrerBenefit !== undefined &&
                (updates.referrerBenefit < 0 || updates.referrerBenefit > 100)) {
                return reply.status(400).send({
                    message: "Referrer benefit percentage must be between 0 and 100",
                    note: "When discountType is 'percentage', referrerBenefit represents a percentage (e.g., 5 = 5% of purchase amount)"
                });
            }
            if (updates.refereeBenefit !== undefined &&
                (updates.refereeBenefit < 0 || updates.refereeBenefit > 100)) {
                return reply.status(400).send({
                    message: "Referee benefit percentage must be between 0 and 100",
                    note: "When discountType is 'percentage', refereeBenefit represents a percentage (e.g., 10 = 10% discount)"
                });
            }
        } else if (updates.discountType === "flat") {
            if (updates.referrerBenefit !== undefined && 
                (updates.referrerBenefit < 0 || updates.referrerBenefit > 50000)) {
                return reply.status(400).send({
                    message: "Referrer benefit (flat) must be between 0 and 50000 INR",
                    note: "When discountType is 'flat', referrerBenefit is in INR (e.g., 100 = ₹100 credit)"
                });
            }
            if (updates.refereeBenefit !== undefined &&
                (updates.refereeBenefit < 0 || updates.refereeBenefit > 50000)) {
                return reply.status(400).send({
                    message: "Referee benefit (flat) must be between 0 and 50000 INR",
                    note: "When discountType is 'flat', refereeBenefit is in INR (e.g., 500 = ₹500 discount)"
                });
            }
        }

        // Get previous settings for audit
        const previousSettings = await ReferralSettings.findOne().lean();
        const isNewSettings = !previousSettings;

        // Prepare update object
        const settingsToUpdate: Partial<IReferralSettings> = {
            ...updates,
            updatedBy: userId
        };

        // Upsert settings
        const updatedSettings = await ReferralSettings.findOneAndUpdate(
            {},
            settingsToUpdate,
            {
                new: true,
                upsert: true,
                runValidators: true
            }
        ).populate("updatedBy", "fullname email");

        // Determine which fields changed
        const changedFields: string[] = [];
        if (previousSettings) {
            const fieldKeys: (keyof UpdateSettingsBody)[] = [
                "discountType", "referrerBenefit", "refereeBenefit",
                "isActive", "maxUsagePerCode", "validityDays", "minPurchaseAmount"
            ];

            for (const key of fieldKeys) {
                if (updates[key] !== undefined &&
                    (previousSettings as any)[key] !== updates[key]) {
                    changedFields.push(key);
                }
            }
        } else {
            changedFields.push(...Object.keys(updates));
        }

        // Create audit log entry
        await ReferralSettingsAudit.create({
            adminId: userId,
            adminName: admin.fullname,
            adminEmail: admin.email,
            action: isNewSettings ? "create" :
                (updates.isActive !== undefined && changedFields.length === 1) ? "toggle" : "update",
            previousSettings: previousSettings || {},
            newSettings: updatedSettings?.toObject() || {},
            changedFields,
            ipAddress: req.headers["x-forwarded-for"]?.toString() ||
                req.headers["x-real-ip"]?.toString() ||
                req.ip,
            userAgent: req.headers["user-agent"],
        });

        console.log(`✅ Referral settings updated by ${admin.email}:`, {
            changedFields,
            isActive: updatedSettings?.isActive
        });

        return reply.status(200).send({
            message: "Referral settings updated successfully",
            settings: {
                ...updatedSettings?.toObject(),
                descriptionNote: `Referrer gets ${updatedSettings?.discountType === 'flat' ? `₹${updatedSettings?.referrerBenefit}` : `${updatedSettings?.referrerBenefit}% of purchase amount`} per successful referral. Referee gets ${updatedSettings?.discountType === 'flat' ? `₹${updatedSettings?.refereeBenefit}` : `${updatedSettings?.refereeBenefit}% discount`} on their purchase.`
            },
            changedFields
        });
    } catch (error) {
        console.error("Error updating referral settings:", error);
        reply.status(500).send({ message: "Failed to update referral settings", error });
    }
};

/**
 * Get referral settings audit log (Admin only)
 */
export const getReferralSettingsAuditLog = async (
    req: FastifyRequest<{ Querystring: AuditQueryParams }>,
    reply: FastifyReply
) => {
    try {
        const page = parseInt(req.query.page || "1");
        const limit = parseInt(req.query.limit || "20");
        const skip = (page - 1) * limit;

        const [auditLogs, total] = await Promise.all([
            ReferralSettingsAudit.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ReferralSettingsAudit.countDocuments()
        ]);

        return reply.status(200).send({
            auditLogs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting audit log:", error);
        reply.status(500).send({ message: "Failed to get audit log", error });
    }
};

/**
 * Toggle referral program active status (Admin only)
 */
export const toggleReferralProgram = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        const admin = await User.findById(userId);
        if (!admin) {
            return reply.status(404).send({ message: "Admin user not found" });
        }

        const currentSettings = await ReferralSettings.findOne();

        if (!currentSettings) {
            return reply.status(400).send({
                message: "Please configure referral settings first"
            });
        }

        const newActiveStatus = !currentSettings.isActive;
        currentSettings.isActive = newActiveStatus;
        currentSettings.updatedBy = userId as any;
        await currentSettings.save();

        // Create audit log
        await ReferralSettingsAudit.create({
            adminId: userId,
            adminName: admin.fullname,
            adminEmail: admin.email,
            action: "toggle",
            previousSettings: { isActive: !newActiveStatus },
            newSettings: { isActive: newActiveStatus },
            changedFields: ["isActive"],
            ipAddress: req.headers["x-forwarded-for"]?.toString() ||
                req.headers["x-real-ip"]?.toString() ||
                req.ip,
            userAgent: req.headers["user-agent"],
        });

        return reply.status(200).send({
            message: `Referral program ${newActiveStatus ? "activated" : "deactivated"}`,
            isActive: newActiveStatus
        });
    } catch (error) {
        console.error("Error toggling referral program:", error);
        reply.status(500).send({ message: "Failed to toggle referral program", error });
    }
};
