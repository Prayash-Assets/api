import { FastifyInstance } from "fastify";
import {
  getDashboardStats,
  getRealTimeMetrics,
  getSystemHealth,
} from "../controllers/dashboardController";
import { authenticate } from "../middleware/rbacMiddleware";

// Simple admin check middleware
const checkAdmin = async (request: any, reply: any) => {
  await authenticate(request, reply);
  
  if (request.user) {
    const User = require("../models/User").default;
    const user = await User.findById(request.user.id);
    
    if (!user || user.userType.toLowerCase() !== "admin") {
      return reply.status(403).send({ error: "Admin access required" });
    }
    
    request.user = { ...request.user, userType: user.userType };
  }
};

export default async function dashboardRoutes(fastify: FastifyInstance) {
  // All dashboard routes require admin access
  const adminOnly = [checkAdmin];

  // Get comprehensive dashboard statistics
  fastify.get("/stats", { preHandler: adminOnly }, getDashboardStats);

  // Get real-time metrics for live updates
  fastify.get(
    "/metrics/realtime",
    { preHandler: adminOnly },
    getRealTimeMetrics
  );

  // Get system health status
  fastify.get("/health", { preHandler: adminOnly }, getSystemHealth);
}
