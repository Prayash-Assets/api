import { FastifyInstance } from "fastify";
import {
  createLevel,
  getAllLevels,
  getLevelById,
  updateLevel,
  deleteLevel,
} from "../controllers/levelController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function levelRoutes(fastify: FastifyInstance) {
  // Admin-only routes for level management
  fastify.post(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createLevel as any
  );
  fastify.put(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateLevel as any
  );
  fastify.delete(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteLevel as any
  );

  // Read operations - accessible to authenticated users (students and admins)
  fastify.get(
    "/",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllLevels as any
  );
  fastify.get(
    "/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getLevelById as any
  );
}
