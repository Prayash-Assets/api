import { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
  ICreateRoleBody, // Import ICreateRoleBody
  IUpdateRoleBody, // Import IUpdateRoleBody
  IRoleParams, // Import IRoleParams
} from "../controllers/roleController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function roleRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post<{ Body: ICreateRoleBody }>(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createRole
  );
  fastify.get("/", { preHandler: [checkRoles(["admin"])] }, getAllRoles);
  fastify.get<{ Params: IRoleParams }>(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    getRoleById
  );
  fastify.put<{ Params: IRoleParams; Body: IUpdateRoleBody }>(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateRole
  );
  fastify.delete<{ Params: IRoleParams }>(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteRole
  );
}
