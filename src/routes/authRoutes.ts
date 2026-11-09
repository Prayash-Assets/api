import { FastifyInstance } from "fastify";
import {
  login,
  register,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  refreshToken,
  requestPasswordReset,
  resetPassword,
  verifyToken,
  verifyEmail,
  resendVerification,
  validateSession,
} from "../controllers/authController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function authRoutes(fastify: FastifyInstance) {
  const authRateLimit = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
  };

  // Public routes (stricter rate limits on credential endpoints)
  fastify.post("/login", authRateLimit, login);
  fastify.post("/register", authRateLimit, register);
  fastify.post("/logout", logout);
  fastify.post("/refresh-token", authRateLimit, refreshToken);
  fastify.post("/request-password-reset", authRateLimit, requestPasswordReset);
  fastify.post("/reset-password", authRateLimit, resetPassword);
  fastify.post("/verify-email", authRateLimit, verifyEmail);
  fastify.post("/resend-verification", authRateLimit, resendVerification);

  // Protected routes (authentication required)
  fastify.get(
    "/profile",
    { preHandler: [checkRoles(["student", "admin", "orgadmin"])] },
    getProfile
  );
  fastify.put(
    "/profile",
    { preHandler: [checkRoles(["student", "admin", "orgadmin"])] },
    updateProfile
  );
  fastify.post(
    "/change-password",
    { preHandler: [checkRoles(["student", "admin", "orgadmin"])] },
    changePassword
  );
  fastify.get("/verify-token", verifyToken);
  fastify.get(
    "/validate-session",
    { preHandler: [checkRoles(["student", "admin", "orgadmin"])] },
    validateSession
  );
}
