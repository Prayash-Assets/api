import { FastifyInstance } from "fastify";
import {
  createResult,
  getAllResults,
  getResultById,
  getResultsByStudent,
  getResultsByMockTest,
  updateResult,
  deleteResult,
  getAdminResults,
  getResultsAnalytics,
  exportResultsCSV,
  getAdminResultById,
} from "../controllers/resultController";
import { checkRoles } from "../middleware/rbacMiddleware";

export const resultRoutes = async (fastify: FastifyInstance) => {
  // Admin-only routes for result management
  fastify.post(
    "/results",
    { preHandler: [checkRoles(["admin"])] },
    createResult as any
  );
  fastify.put(
    "/results/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateResult as any
  );
  fastify.delete(
    "/results/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteResult as any
  );

  // Read operations - accessible to authenticated users (students can see their own, admins see all)
  fastify.get(
    "/results",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllResults as any
  );
  fastify.get(
    "/results/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getResultById as any
  );

  // Student and admin access for filtering results
  fastify.get(
    "/results/student/:studentId",
    { preHandler: [checkRoles(["student", "admin"])] },
    getResultsByStudent as any
  );
  fastify.get(
    "/results/mocktest/:mockTestId",
    { preHandler: [checkRoles(["student", "admin"])] },
    getResultsByMockTest as any
  );

  // Admin-only routes for mocktest results management
  fastify.get(
    "/admin/results",
    { preHandler: [checkRoles(["admin"])] },
    getAdminResults as any
  );

  fastify.get(
    "/admin/results/:id",
    { preHandler: [checkRoles(["admin"])] },
    getAdminResultById as any
  );

  fastify.get(
    "/admin/results/analytics",
    { preHandler: [checkRoles(["admin"])] },
    getResultsAnalytics as any
  );

  fastify.get(
    "/admin/results/export/csv",
    { preHandler: [checkRoles(["admin"])] },
    exportResultsCSV as any
  );
};
