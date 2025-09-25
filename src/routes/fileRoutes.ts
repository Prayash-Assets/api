import { FastifyInstance } from "fastify";
import { getFileAccess } from "../controllers/fileController";

export default async function fileRoutes(fastify: FastifyInstance) {
  fastify.get("/packages/:packageId/files/:fileName/access", getFileAccess);
}