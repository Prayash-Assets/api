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

  // Read operations - public access
  fastify.get(
    "/",
    getAllSubjects as any
  );
  fastify.get(
    "/:id",
    getSubjectById as any
  );
}
