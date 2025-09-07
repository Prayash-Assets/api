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
} from "../controllers/authController";
import { checkRoles } from "../middleware/rbacMiddleware";

export default async function authRoutes(fastify: FastifyInstance) {
  // Public routes (no authentication required)
  fastify.post("/login", login);
  fastify.post("/register", register);
  fastify.post("/logout", logout);
  fastify.post("/refresh-token", refreshToken);
  fastify.post("/request-password-reset", requestPasswordReset);
  fastify.post("/reset-password", resetPassword);
  fastify.post("/verify-email", verifyEmail);
  fastify.post("/resend-verification", resendVerification);

  // Protected routes (authentication required)
  fastify.get(
    "/profile",
    { preHandler: [checkRoles(["student", "admin"])] },
    getProfile
  );
  fastify.put(
    "/profile",
    { preHandler: [checkRoles(["student", "admin"])] },
    updateProfile
  );
  fastify.post(
    "/change-password",
    { preHandler: [checkRoles(["student", "admin"])] },
    changePassword
  );
  fastify.get("/verify-token", verifyToken);
}
