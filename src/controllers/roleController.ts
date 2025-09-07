import { FastifyRequest, FastifyReply } from "fastify";
import Role, { IRole } from "../models/Role";

export interface ICreateRoleBody {
  name: string;
  description?: string;
}

export interface IUpdateRoleBody {
  name?: string;
  description?: string;
}

export interface IRoleParams {
  id: string;
}

/**
 * Creates a new role.
 * @param req - The Fastify request object, containing the role name and optional description in the body.
 * @param reply - The Fastify reply object.
 * @returns A new role object or an error message.
 */
export const createRole = async (
  req: FastifyRequest<{ Body: ICreateRoleBody }>,
  reply: FastifyReply
) => {
  try {
    const role = new Role(req.body);
    await role.save();
    reply.code(201).send(role);
  } catch (error: any) {
    if (error.code === 11000) {
      // Handle duplicate key error for name
      reply.code(409).send({ error: "Role name already exists." });
    } else {
      reply.code(500).send({ error: error.message });
    }
  }
};

/**
 * Retrieves all roles.
 * @param req - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of role objects or an error message.
 */
export const getAllRoles = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const roles = await Role.find();
    reply.send(roles);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves a role by its ID.
 * @param req - The Fastify request object, containing the role ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A role object or an error message if not found.
 */
export const getRoleById = async (
  req: FastifyRequest<{ Params: IRoleParams }>,
  reply: FastifyReply
) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return reply.code(404).send({ error: "Role not found" });
    }
    reply.send(role);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Updates an existing role by its ID.
 * @param req - The Fastify request object, containing the role ID in the params and updated data in the body.
 * @param reply - The Fastify reply object.
 * @returns The updated role object or an error message if not found.
 */
export const updateRole = async (
  req: FastifyRequest<{ Params: IRoleParams; Body: IUpdateRoleBody }>,
  reply: FastifyReply
) => {
  try {
    const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!role) {
      return reply.code(404).send({ error: "Role not found" });
    }
    reply.send(role);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Deletes a role by its ID.
 * @param req - The Fastify request object, containing the role ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found.
 */
export const deleteRole = async (
  req: FastifyRequest<{ Params: IRoleParams }>,
  reply: FastifyReply
) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) {
      return reply.code(404).send({ error: "Role not found" });
    }
    reply.send({ message: "Role deleted successfully" });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};
