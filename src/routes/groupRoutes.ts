import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/rbacMiddleware";
import {
    createGroup,
    getMyGroups,
    getGroupById,
    getGroupByCode,
    joinGroup,
    leaveGroup,
    removeMember,
    archiveGroup,
    sendInvitations,
    acceptInvitation,
    getAllActiveGroups,
} from "../controllers/groupController";

/**
 * Group Routes
 * Endpoints for study group management
 */
export const groupRoutes = async (fastify: FastifyInstance) => {
    // All routes require authentication
    fastify.addHook("preHandler", authenticate);

    // Get all active groups (for admin/dropdowns)
    fastify.get("/all/active", getAllActiveGroups);

    // Create new group
    fastify.post("/", createGroup);

    // Get user's groups
    fastify.get("/", getMyGroups);

    // Get group by ID (must be a member)
    fastify.get("/:id", getGroupById);

    // Get group by code (for join preview - public info)
    fastify.get("/code/:code", getGroupByCode);

    // Join group with code
    fastify.post("/join", joinGroup);

    // Leave group
    fastify.post("/:id/leave", leaveGroup);

    // Remove member (leader only)
    fastify.delete("/:id/members/:memberId", removeMember);

    // Archive group (leader only)
    fastify.patch("/:id/archive", archiveGroup);

    // Send invitations (leader only)
    fastify.post("/:id/invite", sendInvitations);

    // Accept invitation by token
    fastify.post("/invite/:token/accept", acceptInvitation);
};
