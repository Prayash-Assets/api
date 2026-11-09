import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { getJwtSecret } from "../utils/jwtSecret";

export interface AuthenticatedRequest extends FastifyRequest {
  user?: any;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, getJwtSecret()) as any;

    const user = await User.findById(decoded.id).populate("roles");
    if (!user) {
      return reply.status(401).send({ error: "User not found" });
    }

    const userRoles = user.roles?.map((role: any) => role.name) || [];
    req.user = {
      id: user.id,
      email: user.email,
      roles: userRoles,
      userType: user.userType,
    };
  } catch (error) {
    return reply.status(401).send({ error: "Invalid token" });
  }
};

export const checkRoles = (allowedRoles: string[]) => {
  return async (req: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "No token provided" });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, getJwtSecret()) as any;

      const user = await User.findById(decoded.id).populate("roles");
      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const userRoles = user.roles?.map((role: any) => role.name) || [];

      const hasPermission = allowedRoles.some(
        (role) =>
          userRoles.some(
            (ur: string) => String(ur).toLowerCase() === role.toLowerCase()
          ) || user.userType?.toLowerCase() === role.toLowerCase()
      );

      if (!hasPermission) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      req.user = {
        id: user.id,
        email: user.email,
        roles: userRoles,
        userType: user.userType,
      };
    } catch (error: any) {
      console.error("Authentication error:", error.message);
      return reply.status(401).send({ error: "Invalid token" });
    }
  };
};

export function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (user.userType?.toLowerCase() === "admin") return true;
  return (user.roles || []).some(
    (r: string) => String(r).toLowerCase() === "admin"
  );
}
