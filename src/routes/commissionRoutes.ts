import { FastifyInstance } from "fastify";
import { authenticate, checkRoles } from "../middleware/rbacMiddleware";
import {
    getAllCommissions,
    getCommissionById,
    markCommissionAsPaid,
    getCommissionSummary,
    updateCommissionStatus,
} from "../controllers/commissionController";

/**
 * Commission Routes
 * Admin endpoints for managing commission payouts
 */
export const commissionRoutes = async (fastify: FastifyInstance) => {
    // Admin: Get commission summary statistics
    fastify.get(
        "/summary",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        getCommissionSummary as any
    );

    // Admin: Get all commissions with filters
    fastify.get(
        "/",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        getAllCommissions as any
    );

    // Admin: Get commission by ID
    fastify.get(
        "/:id",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        getCommissionById as any
    );

    // Admin: Mark commission as paid
    fastify.post(
        "/:id/mark-paid",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        markCommissionAsPaid as any
    );

    // Admin: Update commission status
    fastify.put(
        "/:id/status",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        updateCommissionStatus as any
    );
};
