import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { handleRazorpayWebhook } from "../controllers/webhookController";

export default async function webhookRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Razorpay webhook endpoint - no authentication required
  fastify.post("/razorpay", {
    config: {
      // Disable body parsing to get raw body for signature verification
      rawBody: true
    }
  }, handleRazorpayWebhook);
}
