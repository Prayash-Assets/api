import { FastifyInstance } from "fastify";
import { authenticate, checkRoles } from "../middleware/rbacMiddleware";
import {
    registerOrganization,
    verifyOrganizationEmail,
    resendOrganizationOTP,
    getOrganization,
    addMember,
    resendMemberInvite,
    bulkAddMembers,
    getMembers,
    removeMember,
    getPendingOrganizations,
    verifyOrganization,
    updateOrganizationSettings,
    getMyOrganization,
    getMemberPurchases,
    getFinancialReport,
    // Org member invite onboarding
    validateInviteToken,
    startOrgMemberOnboarding,
    completeOrgMemberOnboarding,
    resendOrgMemberOTP,
    getAllOrganizations,
    getOrganizationCommissionSummary,
} from "../controllers/organizationController";

/**
 * Organization Routes
 * B2B organization management endpoints
 */
export const organizationRoutes = async (fastify: FastifyInstance) => {
    // Public: Register new organization
    fastify.post("/register", registerOrganization as any);

    // Public: Verify organization email with OTP
    fastify.post("/verify-email", verifyOrganizationEmail as any);

    // Public: Resend OTP for organization
    fastify.post("/resend-otp", resendOrganizationOTP as any);

    // ================================
    // PUBLIC: ORG MEMBER INVITE ONBOARDING
    // ================================

    // Public: Validate invite token
    fastify.get("/invite/:token", validateInviteToken as any);

    // Public: Start onboarding (send OTP)
    fastify.post("/invite/:token/start", startOrgMemberOnboarding as any);

    // Public: Complete onboarding (verify OTP + set password)
    fastify.post("/invite/:token/complete", completeOrgMemberOnboarding as any);

    // Public: Resend OTP for member onboarding
    fastify.post("/invite/:token/resend-otp", resendOrgMemberOTP as any);

    // ================================
    // ORG ADMIN PORTAL ENDPOINTS
    // ================================

    // Authenticated: Get current user's organization (for org admin portal)
    fastify.get(
        "/my-org",
        { preHandler: [authenticate] },
        getMyOrganization as any
    );

    // Authenticated: Get member purchases for organization
    fastify.get(
        "/:id/purchases",
        { preHandler: [authenticate] },
        getMemberPurchases as any
    );

    // Authenticated: Get financial report for organization
    fastify.get(
        "/:id/financial-report",
        { preHandler: [authenticate] },
        getFinancialReport as any
    );

    // Authenticated: Get real-time commission summary (pending/paid)
    fastify.get(
        "/:id/commission-summary",
        { preHandler: [authenticate] },
        getOrganizationCommissionSummary as any
    );

    // ================================
    // EXISTING ENDPOINTS
    // ================================

    // Authenticated: Get organization details
    fastify.get(
        "/:id",
        { preHandler: [authenticate] },
        getOrganization as any
    );

    // Authenticated: Add single member
    fastify.post(
        "/:id/members",
        { preHandler: [authenticate] },
        addMember as any
    );

    // Authenticated: Bulk add members
    fastify.post(
        "/:id/members/bulk",
        { preHandler: [authenticate] },
        bulkAddMembers as any
    );

    // Authenticated: Get members list
    fastify.get(
        "/:id/members",
        { preHandler: [authenticate] },
        getMembers as any
    );

    // Authenticated: Remove member
    fastify.delete(
        "/:id/members/:memberId",
        { preHandler: [authenticate] },
        removeMember as any
    );

    // Authenticated: Resend member invite
    fastify.post(
        "/:id/members/:memberId/resend-invite",
        { preHandler: [authenticate] },
        resendMemberInvite as any
    );

    // Admin: Get pending organizations
    fastify.get(
        "/admin/pending",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        getPendingOrganizations as any
    );

    // Admin: Verify or reject organization
    fastify.post(
        "/admin/:id/verify",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        verifyOrganization as any
    );

    // Admin: Update organization settings (tier, discount, commission, etc.)
    fastify.put(
        "/admin/:id/settings",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        updateOrganizationSettings as any
    );

    // Authenticated: Get all verified organizations (for dropdowns)
    fastify.get(
        "/top/all",
        { preHandler: [authenticate] },
        getAllOrganizations as any
    );
};

