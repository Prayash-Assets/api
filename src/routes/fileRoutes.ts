import { FastifyInstance } from "fastify";
import { getFileAccess } from "../controllers/fileController";
import { authenticate } from "../middleware/rbacMiddleware";

export default async function fileRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/packages/:packageId/files/:fileName/access",
    { preHandler: [authenticate] },
    getFileAccess
  );
}
