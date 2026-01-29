import { FastifyInstance } from "fastify";
import { checkRoles } from "../middleware/rbacMiddleware";
import {
    getMyReferralCode,
    validateReferralCode,
    getMyReferralStats,
    regenerateReferralCode,
    ValidateReferralBody
} from "../controllers/referralController";

/**
 * Referral Routes
 * Student-facing referral operations
 */
export default async function referralRoutes(fastify: FastifyInstance) {
    // Get my referral code (generates if not exists)
    fastify.get(
        "/my-code",
        { preHandler: [checkRoles(["student"])] },
        getMyReferralCode
    );

    // Validate a referral code during checkout
    // Validate a referral code during checkout
    fastify.post<{ Body: ValidateReferralBody }>(
        "/validate",
        { preHandler: [checkRoles(["student"])] },
        validateReferralCode
    );

    // Get my referral statistics
    fastify.get(
        "/my-stats",
        { preHandler: [checkRoles(["student"])] },
        getMyReferralStats
    );

    // Regenerate referral code (only if no successful referrals)
    fastify.post(
        "/regenerate",
        { preHandler: [checkRoles(["student"])] },
        regenerateReferralCode
    );
}
