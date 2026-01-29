import { FastifyInstance } from "fastify";
import { authenticate, checkRoles } from "../middleware/rbacMiddleware";
import {
    checkAvailableDiscounts,
    validateDiscount,
    getDiscountRules,
    createDiscountRule,
    updateDiscountRule,
    getAllDiscountRules,
} from "../controllers/discountController";

/**
 * Discount Routes
 * Public and admin endpoints for discount management
 */
export const discountRoutes = async (fastify: FastifyInstance) => {
    // Public: Get active discount rules (for display on frontend)
    fastify.get("/rules", getDiscountRules);

    // Authenticated: Check available discounts for current user
    fastify.get(
        "/check",
        { preHandler: [authenticate] },
        checkAvailableDiscounts as any
    );

    // Authenticated: Validate discount before payment
    fastify.post(
        "/validate",
        { preHandler: [authenticate] },
        validateDiscount as any
    );

    // Admin: Get all discount rules (including inactive)
    fastify.get(
        "/admin/rules",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        getAllDiscountRules
    );

    // Admin: Create discount rule
    fastify.post(
        "/admin/rules",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        createDiscountRule as any
    );

    // Admin: Update discount rule
    fastify.post(
        "/admin/rules/:id",
        { preHandler: [authenticate, checkRoles(["Admin"])] },
        updateDiscountRule as any
    );
};
