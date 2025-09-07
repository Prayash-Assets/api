import { FastifyInstance, FastifyRequest } from "fastify";
import {
  getEmailSettings,
  createEmailSettings,
  updateEmailSettings,
  testEmailSettings,
} from "../controllers/emailSettings.controller";
import {
  getPaymentSettings,
  createPaymentSettings,
  updatePaymentSettings,
  testPaymentSettings,
} from "../controllers/paymentSettings.controller";
import { checkRoles } from "../middleware/rbacMiddleware";

interface ParamsWithId {
  id: string;
}

async function settingsRoutes(fastify: FastifyInstance) {
  // Email Settings Routes - Admin only access
  fastify.get(
    "/email",
    { preHandler: [checkRoles(["admin"])] },
    getEmailSettings as any
  );
  fastify.post(
    "/email",
    { preHandler: [checkRoles(["admin"])] },
    createEmailSettings as any
  );
  fastify.put(
    "/email",
    { preHandler: [checkRoles(["admin"])] },
    updateEmailSettings as any
  );
  fastify.post(
    "/email/test",
    { preHandler: [checkRoles(["admin"])] },
    testEmailSettings as any
  );

  // Payment Settings Routes - Admin only access
  fastify.get(
    "/payment",
    { preHandler: [checkRoles(["admin", "student"])] },
    getPaymentSettings as any
  );
  fastify.post(
    "/payment",
    { preHandler: [checkRoles(["admin"])] },
    createPaymentSettings as any
  );
  fastify.put(
    "/payment",
    { preHandler: [checkRoles(["admin"])] },
    updatePaymentSettings as any
  );
  fastify.post(
    "/payment/test",
    { preHandler: [checkRoles(["admin"])] },
    testPaymentSettings as any
  );

  // Keep the old ID-based routes for backward compatibility if needed - Admin only access
  fastify.put(
    "/email/:id",
    { preHandler: [checkRoles(["admin"])] },
    async (
      request: FastifyRequest<{
        Params: ParamsWithId;
        Body: any;
      }>,
      reply
    ) => {
      // Redirect to the main update endpoint
      request.body = request.body;
      return updateEmailSettings(request as any, reply);
    }
  );

  fastify.put(
    "/payment/:id",
    { preHandler: [checkRoles(["admin"])] },
    async (
      request: FastifyRequest<{
        Params: ParamsWithId;
        Body: any;
      }>,
      reply
    ) => {
      // Redirect to the main update endpoint
      request.body = request.body;
      return updatePaymentSettings(request as any, reply);
    }
  );
}

export default settingsRoutes;
