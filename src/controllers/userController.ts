import { FastifyRequest, FastifyReply } from "fastify";
import User, { IUser, IStudent, IAdmin, Student, Admin } from "../models/User";
import { Types } from "mongoose"; // Import Types for ObjectId handling if necessary
import bcrypt from "bcryptjs"; // Add this import for bcrypt

export interface ICreateUserBody {
  // Added export
  fullname?: string;
  email?: string;
  password?: string;
  phone?: number;
  userType: "Student" | "Admin"; // Required discriminator field
  roles?: string[]; // Array of Role ObjectIds as strings
  // Student-specific fields
  city?: string;
  state?: string;
  education?: string;
  school?: string;
  // Admin-specific fields
  address?: string;
}

export interface IUserParams {
  // Added export
  id: string;
}

/**
 * Creates a new user.
 * @param req - The Fastify request object, containing user data in the body.
 * @param reply - The Fastify reply object.
 * @returns A new user object or an error message.
 */
export const createUser = async (
  req: FastifyRequest<{ Body: ICreateUserBody }>,
  reply: FastifyReply
) => {
  try {
    const {
      roles,
      userType,
      fullname,
      email,
      phone,
      city,
      state,
      education,
      school,
      address,
      ...userData
    } = req.body;
    console.log("User data:", userData);

    // Validate required fields
    if (!userType) {
      return reply.code(400).send({ error: "userType is required" });
    }

    if (!fullname) {
      return reply.code(400).send({ error: "fullname is required" });
    }

    if (!email) {
      return reply.code(400).send({ error: "email is required" });
    }

    // Check if email already exists
    const existingEmailUser = await User.findOne({ email });
    if (existingEmailUser) {
      const error: any = new Error("Email already exists");
      error.statusCode = 409; // Conflict
      throw error;
    }

    // Check if phone number already exists (if provided)
    if (phone) {
      const existingPhoneUser = await User.findOne({ phone });
      if (existingPhoneUser) {
        const error: any = new Error("Phone number already exists");
        error.statusCode = 409; // Conflict
        throw error;
      }
    }

    // Validate Admin-specific requirements
    if (userType === "Admin" && !phone) {
      return reply
        .code(400)
        .send({ error: "Phone number is required for Admin users" });
    }

    // Generate an 8-digit alphanumeric password
    const generatedPassword = Math.random().toString(36).slice(-8);

    // Encrypt the password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);

    let newUser;

    // Create user based on userType using discriminators
    if (userType === "Student") {
      newUser = new Student({
        fullname,
        email,
        password: hashedPassword,
        phone,
        city,
        state,
        education,
        school,
        userType: "Student",
      });
    } else if (userType === "Admin") {
      newUser = new Admin({
        fullname,
        email,
        password: hashedPassword,
        phone,
        address,
        userType: "Admin",
      });
    } else {
      return reply.code(400).send({ error: "Invalid user type" });
    }

    if (roles && Array.isArray(roles)) {
      // Mongoose will attempt to cast string IDs to ObjectIds
      newUser.roles = roles as unknown as Types.ObjectId[];
    }

    await newUser.save();
    const populatedUser = await User.findById(newUser._id).populate("roles");

    // Return user without password and with generated password for admin reference
    const userResponse = {
      ...populatedUser?.toObject(),
      generatedPassword, // Include generated password in response for admin to share
      password: undefined, // Remove hashed password from response
    };

    reply.code(201).send(userResponse);
  } catch (error: any) {
    if (error.statusCode === 409) {
      return reply.code(409).send({ error: error.message });
    }
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves all users.
 * @param req - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of user objects or an error message.
 */
export const getAllUsers = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const users = await User.find().populate("roles");
    reply.send(users);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves a user by their ID.
 * @param req - The Fastify request object, containing the user ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A user object or an error message if not found.
 */
export const getUserById = async (
  req: FastifyRequest<{ Params: IUserParams }>,
  reply: FastifyReply
) => {
  try {
    const user = await User.findById(req.params.id).populate("roles");
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    reply.send(user);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Updates an existing user by their ID.
 * @param req - The Fastify request object, containing the user ID in the params and updated data in the body.
 * @param reply - The Fastify reply object.
 * @returns The updated user object or an error message if not found.
 */
export const updateUser = async (
  req: FastifyRequest<{ Params: IUserParams; Body: Partial<IUser> }>,
  reply: FastifyReply
) => {
  try {
    // If roles are passed as string[], Mongoose should cast them to ObjectId[]
    // Ensure req.body.roles, if present, is an array of valid Role ObjectId strings
    const updateData = req.body;

    // Remove userType from update data as it shouldn't be changed after creation
    if ("userType" in updateData) {
      delete updateData.userType;
    }

    if (updateData.roles && Array.isArray(updateData.roles)) {
      // Mongoose handles casting string to ObjectId for schema type ObjectId
      // No explicit casting needed here if schema is correct
    }

    // Validate Admin phone requirement if updating an Admin user
    const existingUser = await User.findById(req.params.id);
    if (existingUser?.userType === "Admin" && updateData.phone === null) {
      return reply
        .code(400)
        .send({ error: "Phone number is required for Admin users" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate("roles");

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    reply.send(user);
  } catch (error: any) {
    // Handle duplicate key errors for email/phone if they occur during update
    if (error.code === 11000) {
      return reply
        .code(409)
        .send({ error: "Email or phone number already exists." });
    }
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Deletes a user by their ID.
 * @param req - The Fastify request object, containing the user ID in the params.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found.
 */
export const deleteUser = async (
  req: FastifyRequest<{ Params: IUserParams }>,
  reply: FastifyReply
) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    reply.send({ message: "User deleted successfully" });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Updates a user's password by their ID.
 * @param req - The Fastify request object, containing the user ID in the params and the new password in the body.
 * @param reply - The Fastify reply object.
 * @returns A success message or an error message if not found.
 */
export const updateUserPassword = async (
  req: FastifyRequest<{ Params: IUserParams; Body: { password: string } }>,
  reply: FastifyReply
) => {
  try {
    const { password } = req.body;

    if (!password || password.trim().length === 0) {
      return reply.code(400).send({ error: "Password is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const salt = await bcrypt.genSalt(10); // Generate a salt
    user.password = await bcrypt.hash(password, salt); // Hash the password
    await user.save();

    reply.send({ message: "Password updated successfully" });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves all students.
 * @param req - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of student objects or an error message.
 */
export const getAllStudents = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const students = await Student.find().populate("roles");
    reply.send(students);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves all admins.
 * @param req - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns An array of admin objects or an error message.
 */
export const getAllAdmins = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const admins = await Admin.find().populate("roles");
    reply.send(admins);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};

/**
 * Retrieves users by type.
 * @param req - The Fastify request object, containing the userType in the params.
 * @param reply - The Fastify reply object.
 * @returns An array of user objects filtered by type or an error message.
 */
export const getUsersByType = async (
  req: FastifyRequest<{ Params: { userType: "Student" | "Admin" } }>,
  reply: FastifyReply
) => {
  try {
    const { userType } = req.params;

    if (!["Student", "Admin"].includes(userType)) {
      return reply
        .code(400)
        .send({ error: "Invalid user type. Must be 'Student' or 'Admin'" });
    }

    const users = await User.find({ userType }).populate("roles");
    reply.send(users);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
};
