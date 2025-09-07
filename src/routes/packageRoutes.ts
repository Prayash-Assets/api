import { FastifyInstance, RouteGenericInterface } from "fastify";
import {
  createPackage,
  getAllPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  getAvailablePackages,
} from "../controllers/packageController";
import { checkRoles } from "../middleware/rbacMiddleware";
import { IPackage } from "../models/Package";

interface PackageBody extends RouteGenericInterface {
  Body: IPackage;
}

interface PackageParams extends RouteGenericInterface {
  Params: { id: string };
}

export default async function packageRoutes(fastify: FastifyInstance) {
  // Public route for home page - no authentication required
  fastify.get("/public", getAvailablePackages);

  // Admin routes - for package management
  fastify.post<PackageBody>(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createPackage
  );

  fastify.get("/", { preHandler: [checkRoles(["admin"])] }, getAllPackages);

  fastify.get<PackageParams>(
    "/:id",
    { preHandler: [checkRoles(["admin", "student"])] },
    getPackageById
  );

  fastify.put<PackageParams & PackageBody>(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updatePackage
  );

  fastify.delete<PackageParams>(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deletePackage
  );

  // Protected route for authenticated users to view available packages for purchase
  fastify.get(
    "/available",
    { preHandler: [checkRoles(["student"])] },
    getAvailablePackages
  );
}
