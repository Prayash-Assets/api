import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import User from "../models/User";

export interface AuthenticatedRequest extends FastifyRequest {
  user?: any;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key") as any;
    req.user = { id: decoded.id, email: decoded.email };
  } catch (error) {
    return reply.status(401).send({ error: "Invalid token" });
  }
};

export const checkRoles = (allowedRoles: string[]) => {
  return async (req: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.log("No authorization header found");
        return reply.status(401).send({ error: "No token provided" });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key") as any;
      console.log("Token decoded successfully:", decoded);

      const user = await User.findById(decoded.id).populate("roles");
      if (!user) {
        console.log("User not found with ID:", decoded.id);
        return reply.status(401).send({ error: "User not found" });
      }

      console.log("User found:", {
        id: user.id,
        email: user.email,
        userType: user.userType,
        roles: user.roles
      });

      // Get roles from populated roles array
      const userRoles = user.roles?.map((role: any) => role.name) || [];

      // Also check userType as fallback (e.g., "Admin" or "Student")
      const hasPermission = allowedRoles.some(role =>
        userRoles.includes(role) ||
        user.userType?.toLowerCase() === role.toLowerCase()
      );

      if (!hasPermission) {
        console.log("Permission check failed:", {
          allowedRoles,
          userRoles,
          userType: user.userType
        });
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      req.user = { id: user.id, email: user.email, roles: userRoles, userType: user.userType };

    } catch (error: any) {
      console.error("Authentication error:", error);
      return reply.status(401).send({ error: "Invalid token" });
    }
  };
};
