import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import User from "../models/User";
import logger from "../config/logger";

/**
 * Middleware to validate session ID for single device login
 */
export async function validateSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Skip session validation for certain routes
    const skipRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/verify-email',
      '/auth/resend-verification',
      '/auth/request-password-reset',
      '/auth/reset-password',
      '/packages/public'
    ];

    const path = request.url.split('?')[0]; // Remove query parameters
    if (skipRoutes.some(route => path.includes(route))) {
      return;
    }

    // Get session ID from header
    const sessionId = request.headers['x-session-id'] as string;
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ') || !sessionId) {
      return; // Let other auth middleware handle missing auth
    }

    // Verify JWT token to get user ID
    const token = authHeader.substring(7);
    let decoded: any;
    
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    } catch (jwtError) {
      return; // Let other auth middleware handle invalid token
    }

    // Check if user's active session matches
    const user = await User.findById(decoded.id);
    if (!user) {
      return reply.status(401).send({ error: "User not found" });
    }

    // If user has an active session and it doesn't match current session
    if (user.activeSessionId && user.activeSessionId !== sessionId) {
      logger.warn("Session conflict detected", {
        userId: user.id,
        activeSession: user.activeSessionId,
        requestSession: sessionId
      });

      return reply.status(403).send({
        error: "Session invalid",
        message: "Your account is being used on another device. Please log in again."
      });
    }

    // Update user's active session if not set
    if (!user.activeSessionId) {
      user.activeSessionId = sessionId;
      await user.save();
    }
  } catch (error: any) {
    logger.error("Session validation error", {
      error: error.message,
      stack: error.stack
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}