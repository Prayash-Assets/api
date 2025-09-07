import { FastifyInstance } from "fastify";
import {
  createMockTest,
  getAllMockTests,
  getMockTestById,
  updateMockTest,
  deleteMockTest,
} from "../controllers/mockTestController";
import { checkRoles } from "../middleware/rbacMiddleware";

export const mockTestRoutes = async (fastify: FastifyInstance) => {
  // Admin-only routes for mock test management
  fastify.post(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createMockTest as any
  );
  fastify.put(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateMockTest as any
  );
  fastify.delete(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteMockTest as any
  );

  // Read operations - accessible to authenticated users (students and admins)
  fastify.get(
    "/",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllMockTests as any
  );
  fastify.get(
    "/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getMockTestById as any
  );
};
