import { FastifyInstance } from "fastify";
import {
  createSubject,
  getAllSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
} from "../controllers/subjectController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function subjectRoutes(fastify: FastifyInstance) {
  // Admin-only routes for subject management
  fastify.post(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createSubject as any
  );
  fastify.put(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateSubject as any
  );
  fastify.delete(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteSubject as any
  );

  // Read operations - accessible to authenticated users (students and admins)
  fastify.get(
    "/",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllSubjects as any
  );
  fastify.get(
    "/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getSubjectById as any
  );
}
