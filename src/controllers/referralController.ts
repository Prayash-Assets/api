import { FastifyRequest, FastifyReply } from "fastify";
import User, { Student, IUser } from "../models/User";
import ReferralSettings from "../models/ReferralSettings";
import ReferralUsage from "../models/ReferralUsage";
import {
    generateReferralCode,
    validateCodeFormat,
    normalizeCode,
    calculateReferralDiscount,
    maskReferrerName
} from "../utils/referralUtils";

/**
 * Referral Controller
 * Handles referral code operations for students
 */

export interface ValidateReferralBody {
    referralCode: string;
    packageId?: string;
    purchaseAmount?: number;
}

/**
 * Get or generate the current user's referral code
 */
export const getMyReferralCode = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        const user = await User.findById(userId);
        if (!user) {
            return reply.status(404).send({ message: "User not found" });
        }

        if (user.userType !== "Student") {
            return reply.status(400).send({
                message: "Only students can have referral codes"
            });
        }

        const student = user as any;

        // If student doesn't have a referral code, generate one
        if (!student.referralCode) {
            const newCode = await generateReferralCode();
            student.referralCode = newCode;
            await student.save();
        }

        // Get referral settings to check if program is active
        const settings = await ReferralSettings.findOne();

        return reply.status(200).send({
            referralCode: student.referralCode,
            referralCount: student.referralCount || 0,
            referralCredits: student.referralCredits || 0,
            programActive: settings?.isActive ?? false,
            benefits: settings ? {
                discountType: settings.discountType,
                referrerBenefit: settings.referrerBenefit,
                refereeBenefit: settings.refereeBenefit,
            } : null
        });
    } catch (error) {
        console.error("Error getting referral code:", error);
        reply.status(500).send({ message: "Failed to get referral code", error });
    }
};

/**
 * Validate a referral code (used during checkout)
 */
export const validateReferralCode = async (
    req: FastifyRequest<{ Body: ValidateReferralBody }>,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;
        const { referralCode, purchaseAmount = 0 } = req.body;

        // Validate code format
        if (!validateCodeFormat(referralCode)) {
            return reply.status(400).send({
                valid: false,
                message: "Invalid referral code format"
            });
        }

        const normalizedCode = normalizeCode(referralCode);

        // Check if referral program is active
        const settings = await ReferralSettings.findOne();
        if (!settings || !settings.isActive) {
            return reply.status(400).send({
                valid: false,
                message: "Referral program is currently not active"
            });
        }

        // Find the referrer by code
        const referrer = await User.findOne({
            referralCode: normalizedCode,
            userType: "Student"
        });

        if (!referrer) {
            return reply.status(400).send({
                valid: false,
                message: "Invalid referral code"
            });
        }

        // Prevent self-referral
        if ((referrer._id as any).toString() === userId) {
            return reply.status(400).send({
                valid: false,
                message: "You cannot use your own referral code"
            });
        }

        // Check if user has already used a referral from this referrer
        const existingUsage = await ReferralUsage.findOne({
            referrer: referrer._id,
            referee: userId,
            status: { $in: ["pending", "completed"] }
        });

        if (existingUsage) {
            return reply.status(400).send({
                valid: false,
                message: "You have already used this referral code"
            });
        }

        // Check max usage per code if configured
        if (settings.maxUsagePerCode) {
            const usageCount = await ReferralUsage.countDocuments({
                referralCode: normalizedCode,
                status: { $in: ["pending", "completed"] }
            });

            if (usageCount >= settings.maxUsagePerCode) {
                return reply.status(400).send({
                    valid: false,
                    message: "This referral code has reached its maximum usage limit"
                });
            }
        }

        // Calculate discount
        const discountCalc = calculateReferralDiscount(
            purchaseAmount,
            settings.discountType,
            settings.refereeBenefit,
            settings.minPurchaseAmount
        );

        return reply.status(200).send({
            valid: true,
            referrerName: maskReferrerName(referrer.fullname),
            referrerId: referrer._id,
            discount: {
                type: settings.discountType,
                value: settings.refereeBenefit,
                amount: discountCalc.discountAmount,
                isEligible: discountCalc.isEligible,
                reason: discountCalc.reason
            }
        });
    } catch (error) {
        console.error("Error validating referral code:", error);
        reply.status(500).send({ message: "Failed to validate referral code", error });
    }
};

/**
 * Get referral statistics for the current user
 */
export const getMyReferralStats = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        const user = await User.findById(userId);
        if (!user || user.userType !== "Student") {
            return reply.status(400).send({
                message: "Only students can view referral stats"
            });
        }

        const student = user as any;

        // Get recent referral usage
        const recentReferrals = await ReferralUsage.find({
            referrer: userId,
            status: "completed"
        })
            .sort({ completedAt: -1 })
            .limit(10)
            .populate("referee", "fullname")
            .lean();

        // Get pending referrals
        const pendingReferrals = await ReferralUsage.countDocuments({
            referrer: userId,
            status: "pending"
        });

        // Get total earnings (completed referrals)
        const totalEarnings = await ReferralUsage.aggregate([
            { $match: { referrer: user._id, status: "completed" } },
            { $group: { _id: null, total: { $sum: "$referrerCreditAmount" } } }
        ]);

        // Get pending credits (not yet completed)
        const pendingEarnings = await ReferralUsage.aggregate([
            { $match: { referrer: user._id, status: "pending" } },
            { $group: { _id: null, total: { $sum: "$referrerCreditAmount" } } }
        ]);

        const completedCredits = totalEarnings[0]?.total || 0;
        const pendingCredits = pendingEarnings[0]?.total || 0;
        const totalCredits = completedCredits + pendingCredits;

        return reply.status(200).send({
            referralCode: student.referralCode,
            stats: {
                totalReferrals: student.referralCount || 0,
                pendingReferrals,
                totalCredits: totalCredits, // Calculate from actual ReferralUsage records
                totalEarnings: completedCredits, // Only completed
                pendingEarnings: pendingCredits, // Only pending
            },
            recentReferrals: recentReferrals.map((r) => ({
                refereeName: maskReferrerName((r.referee as any)?.fullname || "Unknown"),
                creditAmount: r.referrerCreditAmount,
                completedAt: r.completedAt,
            })),
        });
    } catch (error) {
        console.error("Error getting referral stats:", error);
        reply.status(500).send({ message: "Failed to get referral stats", error });
    }
};

/**
 * Regenerate referral code (if needed)
 */
export const regenerateReferralCode = async (
    req: FastifyRequest,
    reply: FastifyReply
) => {
    try {
        const userId = (req as any).user.id;

        const user = await User.findById(userId);
        if (!user || user.userType !== "Student") {
            return reply.status(400).send({
                message: "Only students can have referral codes"
            });
        }

        const student = user as any;

        // Check if user has any successful referrals (if so, prevent regeneration)
        if (student.referralCount && student.referralCount > 0) {
            return reply.status(400).send({
                message: "Cannot regenerate code after successful referrals"
            });
        }

        const newCode = await generateReferralCode();
        student.referralCode = newCode;
        await student.save();

        return reply.status(200).send({
            referralCode: newCode,
            message: "Referral code regenerated successfully"
        });
    } catch (error) {
        console.error("Error regenerating referral code:", error);
        reply.status(500).send({ message: "Failed to regenerate referral code", error });
    }
};
