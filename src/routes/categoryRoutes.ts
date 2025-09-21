import { FastifyInstance } from "fastify";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/categoryController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function categoryRoutes(fastify: FastifyInstance) {
  // Admin-only routes for category management
  fastify.post(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createCategory as any
  );
  fastify.put(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateCategory as any
  );
  fastify.delete(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteCategory as any
  );

  // Read operations - authenticated access
  fastify.get(
    "/",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllCategories as any
  );
  fastify.get(
    "/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getCategoryById as any
  );
}
