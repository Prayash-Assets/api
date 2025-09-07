import { FastifyInstance, FastifyPluginOptions } from "fastify";
import * as userController from "../controllers/userController";
import { checkRoles } from "../middleware/rbacMiddleware"; // Import checkRoles
import { IUser } from "../models/User"; // Import IUser for Partial<IUser>

// Assuming these types are exported from userController or a related types file
// If userController.ts exports them:
// export interface ICreateUserBody { ... }
// export interface IUserParams { ... }
// Then userController.ICreateUserBody and userController.IUserParams will work.

/**
 * Registers user-related routes to the Fastify instance.
 *
 * @param fastify - The Fastify instance to register the routes on.
 * @param options - Plugin options for the Fastify instance.
 *
 * ### Routes:
 * - **POST /users**: Creates a new user. Requires `admin` role.
 *   - **Body**: {@link userController.ICreateUserBody}
 *
 * - **GET /users**: Retrieves all users. Requires `user` or `admin` role.
 *
 * - **GET /users/:id**: Retrieves a user by ID. Requires `user` or `admin` role.
 *   - **Params**: {@link userController.IUserParams}
 *
 * - **PUT /users/:id**: Updates a user by ID. Requires `admin` role.
 *   - **Params**: {@link userController.IUserParams}
 *   - **Body**: Partial<{@link IUser}>
 *
 * - **DELETE /users/:id**: Deletes a user by ID. Requires `admin` role.
 *   - **Params**: {@link userController.IUserParams}
 *
 * @remarks
 * Each route uses a `preHandler` to check the roles of the requesting user.
 */
async function userRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post<{ Body: userController.ICreateUserBody }>(
    "/users",
    { preHandler: [checkRoles(["admin"])] },
    userController.createUser
  );
  fastify.get(
    "/users",
    { preHandler: [checkRoles(["student", "admin"])] },
    userController.getAllUsers
  );
  fastify.get<{ Params: userController.IUserParams }>(
    "/users/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    userController.getUserById
  );
  fastify.put<{ Params: userController.IUserParams; Body: Partial<IUser> }>(
    "/users/:id",
    { preHandler: [checkRoles(["admin"])] },
    userController.updateUser
  );
  fastify.delete<{ Params: userController.IUserParams }>(
    "/users/:id",
    { preHandler: [checkRoles(["admin"])] },
    userController.deleteUser
  );
  fastify.put<{
    Params: userController.IUserParams;
    Body: { password: string };
  }>(
    "/users/:id/password",
    { preHandler: [checkRoles(["admin", "student"])] },
    userController.updateUserPassword
  );

  // New routes for discriminator models
  fastify.get(
    "/users/students",
    { preHandler: [checkRoles(["admin"])] },
    userController.getAllStudents
  );
  fastify.get(
    "/users/admins",
    { preHandler: [checkRoles(["admin"])] },
    userController.getAllAdmins
  );
  fastify.get<{ Params: { userType: "Student" | "Admin" } }>(
    "/users/type/:userType",
    { preHandler: [checkRoles(["admin"])] },
    userController.getUsersByType
  );
}

export default userRoutes;
