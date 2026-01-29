import { FastifyInstance } from "fastify";
import { checkRoles } from "../middleware/rbacMiddleware";
import {
    getReferralSettings,
    updateReferralSettings,
    getReferralSettingsAuditLog,
    toggleReferralProgram,
    UpdateSettingsBody,
    AuditQueryParams
} from "../controllers/referralSettingsController";

/**
 * Referral Settings Routes
 * Admin operations for referral program configuration
 */
export default async function referralSettingsRoutes(fastify: FastifyInstance) {
    // Get current referral settings (PUBLIC - no auth required)
    // Students need to see settings to understand the referral program
    fastify.get(
        "/public",
        getReferralSettings
    );

    // Get current referral settings (ADMIN)
    fastify.get(
        "/",
        { preHandler: [checkRoles(["admin"])] },
        getReferralSettings
    );

    // Update referral settings
    // Update referral settings
    fastify.put<{ Body: UpdateSettingsBody }>(
        "/",
        { preHandler: [checkRoles(["admin"])] },
        updateReferralSettings
    );

    // Toggle referral program on/off
    fastify.post(
        "/toggle",
        { preHandler: [checkRoles(["admin"])] },
        toggleReferralProgram
    );

    // Get audit log
    // Get audit log
    fastify.get<{ Querystring: AuditQueryParams }>(
        "/audit",
        { preHandler: [checkRoles(["admin"])] },
        getReferralSettingsAuditLog
    );
}
