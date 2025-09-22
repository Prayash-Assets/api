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
        return reply.status(401).send({ error: "No token provided" });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key") as any;
      
      const user = await User.findById(decoded.id).populate("roles");
      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const userRoles = user.roles?.map((role: any) => role.name) || [];
      const hasPermission = allowedRoles.some(role => userRoles.includes(role));
      
      if (!hasPermission) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      req.user = { id: user.id, email: user.email, roles: userRoles, userType: user.userType };
      
    } catch (error) {
      return reply.status(401).send({ error: "Invalid token" });
    }
  };
};
