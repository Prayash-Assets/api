import { FastifyReply, FastifyRequest } from "fastify";
import Joi from "joi";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import User, { IUser, Student, Admin, IStudent, IAdmin, IOrgAdmin } from "../models/User";
import Role from "../models/Role";
import logger from "../config/logger";
import emailService from "../utils/emailService";

// Validation schemas
const registerSchema = Joi.object({
  fullname: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.number().required().messages({
    'number.base': 'Phone number must be a valid number',
    'any.required': 'Phone number is required'
  }),
  userType: Joi.string()
    .valid("student", "admin", "Student", "Admin")
    .required(),
  // Student-specific fields
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  education: Joi.string().optional(),
  school: Joi.string().optional(),
  // Admin-specific fields
  address: Joi.string().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  fullname: Joi.string().min(3).max(30).optional(),
  phone: Joi.number().optional(),
  // Student-specific fields
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  education: Joi.string().optional(),
  school: Joi.string().optional(),
  // Admin-specific fields
  address: Joi.string().optional(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

const resetPasswordRequestSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  resetCode: Joi.string().length(6).required(),
  newPassword: Joi.string().min(6).required(),
});

const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  verificationCode: Joi.string().length(6).required(),
});

const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required(),
});

// Helper function to generate JWT token
const generateToken = (user: IUser, expiresIn: string = "3h"): string => {
  const secret = process.env.JWT_SECRET || "your-secret-key";
  const payload = {
    id: user.id,
    fullname: user.fullname,
    email: user.email,
    userType: user.userType,
    phone: user.phone,
    roles: user.roles,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    // Include Student-specific fields if user is a Student
    ...(user.userType === "Student" && {
      city: (user as IStudent).city,
      state: (user as IStudent).state,
      education: (user as IStudent).education,
      school: (user as IStudent).school,
    }),
    // Include Admin-specific fields if user is an Admin
    ...(user.userType === "Admin" && {
      address: (user as IAdmin).address,
    }),
  };

  return jwt.sign(payload, secret, { expiresIn } as any);
};

// Helper function to generate verification code
const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to check rate limiting for verification emails
const checkVerificationRateLimit = (user: IUser): boolean => {
  if (!user.lastCodeSentAt) return true;

  const now = new Date();
  const timeSinceLastCode = now.getTime() - user.lastCodeSentAt.getTime();
  const oneMinute = 60 * 1000; // 1 minute in milliseconds

  return timeSinceLastCode >= oneMinute;
};

/**
 * Register a new user (Student or Admin) with email verification
 */
export async function register(request: FastifyRequest, reply: FastifyReply) {
  try {
    logger.info("Registration attempt", {
      body: { email: (request.body as any)?.email },
    });

    const { error, value } = registerSchema.validate(request.body);
    if (error) {
      logger.error("Registration validation error", {
        error: error.details[0].message,
      });
      return reply.status(400).send({ error: error.details[0].message });
    }

    const {
      fullname,
      email,
      password,
      userType: rawUserType,
      phone,
      city,
      state,
      education,
      school,
      address,
    } = value;

    // Normalize userType to capitalized format
    const userType =
      rawUserType.toLowerCase() === "student" ? "Student" : "Admin";

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt for existing user", { email });
      return reply.status(400).send({ error: "User already exists" });
    }

    // Check if phone number already exists (if provided)
    if (phone) {
      const existingPhoneUser = await User.findOne({ phone });
      if (existingPhoneUser) {
        return reply.status(400).send({ error: "Phone number already exists" });
      }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification code for all users (Students and Admins)
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    let newUser: IStudent | IAdmin;

    // Create user based on userType using discriminators
    if (userType === "Student") {
      newUser = await Student.create({
        fullname,
        email,
        password: hashedPassword,
        phone,
        city,
        state,
        education,
        school,
        userType: "Student",
        verificationCode,
        verificationExpiry,
        isVerified: false, // Always require verification for students
        verificationAttempts: 0,
        lastCodeSentAt: new Date(),
      });
    } else if (userType === "Admin") {
      newUser = await Admin.create({
        fullname,
        email,
        password: hashedPassword,
        phone,
        address,
        userType: "Admin",
        verificationCode,
        verificationExpiry,
        isVerified: userType === "Admin", // Admins can be auto-verified or require verification based on business logic
        verificationAttempts: 0,
        lastCodeSentAt: new Date(),
      });
    } else {
      return reply.status(400).send({ error: "Invalid user type" });
    }

    // Assign default role based on user type (always lowercase)
    const defaultRole = await Role.findOne({
      name: userType.toLowerCase(),
    });

    if (defaultRole) {
      newUser.roles = [defaultRole._id as any];
      await newUser.save();
    }

    // Send verification email immediately for all users
    const emailSent = await emailService.sendVerificationCode(
      email,
      fullname,
      verificationCode
    );

    if (!emailSent) {
      logger.error("Failed to send verification email", {
        userId: newUser.id,
        email,
      });
      // Still allow registration to proceed, but log the error
      logger.warn("Registration completed but email failed to send", {
        userId: newUser.id,
        email,
      });
    }

    logger.info("User registered successfully", {
      userId: newUser.id,
      userType,
      emailSent,
      requiresVerification: !newUser.isVerified,
    });

    const responseUser = {
      id: newUser.id,
      fullname: newUser.fullname,
      email: newUser.email,
      userType: newUser.userType,
      phone: newUser.phone,
      isVerified: newUser.isVerified,
      ...(userType === "Student" && {
        city: (newUser as IStudent).city,
        state: (newUser as IStudent).state,
        education: (newUser as IStudent).education,
        school: (newUser as IStudent).school,
      }),
      ...(userType === "Admin" && {
        address: (newUser as IAdmin).address,
      }),
    };

    // Always require verification for students, optional for admins
    const requiresVerification = !newUser.isVerified;

    reply.status(201).send({
      message: requiresVerification
        ? "User registered successfully. Please check your email for verification code."
        : "User registered successfully.",
      user: responseUser,
      requiresVerification,
      emailSent,
    });
  } catch (err: any) {
    logger.error("Registration error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Login user and return JWT token
 */
export async function login(request: FastifyRequest, reply: FastifyReply) {
  try {
    logger.info("Login attempt", {
      body: { email: (request.body as any)?.email },
    });

    const { error, value } = loginSchema.validate(request.body);
    if (error) {
      logger.error("Login validation error", {
        error: error.details[0].message,
      });
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { email, password } = value;

    // Find user and populate roles
    const user = await User.findOne({ email }).populate("roles");
    if (!user) {
      logger.warn("Login attempt for non-existent user", { email });
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    if (!user.password) {
      logger.error("User password is not set during login attempt", {
        userId: user.id,
        email,
      });
      return reply.status(500).send({ error: "User password is not set" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn("Invalid password attempt", { email });
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Check if email is verified for Student users
    if (user.userType === "Student" && !user.isVerified) {
      logger.warn("Login attempt with unverified email", {
        email,
        userId: user.id,
      });
      return reply.status(403).send({
        error:
          "Please verify your email before logging in. Check your inbox for the verification code.",
        requiresVerification: true,
        email: user.email,
      });
    }

    // Generate session ID for single device login
    const sessionId = randomUUID();

    // Update user's active session
    user.activeSessionId = sessionId;
    await user.save();

    // Generate tokens
    const accessToken = generateToken(user, "3h");
    const refreshToken = generateToken(user, "7d");

    logger.info("User logged in successfully", {
      userId: user.id,
      userType: user.userType,
      sessionId
    });

    // Build complete user response based on user type
    const userResponse = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      userType: user.userType,
      phone: user.phone,
      roles: user.roles,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Include Student-specific fields if user is a Student
      ...(user.userType === "Student" && {
        city: (user as IStudent).city,
        state: (user as IStudent).state,
        education: (user as IStudent).education,
        school: (user as IStudent).school,
        organization: (user as IStudent).organization,
      }),
      // Include Admin-specific fields if user is an Admin
      ...(user.userType === "Admin" && {
        address: (user as IAdmin).address,
      }),
      // Include OrgAdmin-specific fields if user is an OrgAdmin
      ...(user.userType === "OrgAdmin" && {
        organization: (user as unknown as IOrgAdmin).organization,
      }),
    };

    reply.send({
      message: "Login successful",
      user: userResponse,
      accessToken,
      refreshToken,
      sessionId,
    });
  } catch (err: any) {
    logger.error("Login error", { error: err.message, stack: err.stack });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Logout user (client-side token removal)
 */
export async function logout(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).user?.id;

    if (userId) {
      // Clear active session ID
      const user = await User.findById(userId);
      if (user) {
        user.activeSessionId = undefined;
        await user.save();
        logger.info("User session cleared", { userId });
      }
    }

    logger.info("Logout attempt");
    reply.send({ message: "Logout successful" });
    logger.info("User logged out successfully");
  } catch (err: any) {
    logger.error("Logout error", { error: err.message, stack: err.stack });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Get current user profile
 */
export async function getProfile(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = await User.findById(userId)
      .populate("roles")
      .select("-password");
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    logger.info("Profile retrieved", { userId });
    reply.send({ user });
  } catch (err: any) {
    logger.error("Get profile error", { error: err.message, stack: err.stack });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Update user profile
 */
export async function updateProfile(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { error, value } = updateProfileSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    // Get current user to check type
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Validate Admin phone requirement
    if (currentUser.userType === "Admin" && value.phone === null) {
      return reply
        .status(400)
        .send({ error: "Phone number is required for Admin users" });
    }

    // Check if phone number already exists (if changing phone)
    if (value.phone && value.phone !== currentUser.phone) {
      const existingPhoneUser = await User.findOne({ phone: value.phone });
      if (existingPhoneUser) {
        return reply.status(400).send({ error: "Phone number already exists" });
      }
    }

    // Use appropriate model based on user type for updates
    let updatedUser;
    if (currentUser.userType === "Admin") {
      updatedUser = await Admin.findByIdAndUpdate(userId, value, {
        new: true,
        runValidators: true,
      })
        .populate("roles")
        .select("-password");
    } else {
      updatedUser = await Student.findByIdAndUpdate(userId, value, {
        new: true,
        runValidators: true,
      })
        .populate("roles")
        .select("-password");
    }

    logger.info("Profile updated", { userId });
    reply.send({ message: "Profile updated successfully", user: updatedUser });
  } catch (err: any) {
    logger.error("Update profile error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Change user password
 */
export async function changePassword(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { error, value } = changePasswordSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { currentPassword, newPassword } = value;

    const user = await User.findById(userId);
    if (!user || !user.password) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return reply.status(400).send({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    logger.info("Password changed", { userId });
    reply.send({ message: "Password changed successfully" });
  } catch (err: any) {
    logger.error("Change password error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Refresh access token using refresh token from request body
 */
export async function refreshToken(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { refreshToken } = request.body as { refreshToken: string };
    if (!refreshToken) {
      return reply.status(401).send({ error: "Refresh token not provided" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET || "your-secret-key"
      );
    } catch (jwtError) {
      return reply.status(401).send({ error: "Invalid refresh token" });
    }

    const user = await User.findById(decoded.id).populate("roles");
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Generate new access token
    const newAccessToken = generateToken(user, "3h");

    logger.info("Token refreshed", { userId: user.id });
    reply.send({
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
    });
  } catch (err: any) {
    logger.error("Refresh token error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Request password reset (send reset code)
 */
export async function requestPasswordReset(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { error, value } = resetPasswordRequestSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { email } = value;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not
      return reply.send({
        message: "If the email exists, a reset code has been sent",
      });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();

    // Set expiry to 10 minutes
    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Send password reset email
    const emailSent = await emailService.sendPasswordResetEmail(
      user.email,
      user.fullname,
      resetCode
    );

    if (emailSent) {
      logger.info("Password reset email sent", { userId: user.id, email: user.email });
    } else {
      logger.error("Failed to send password reset email", { userId: user.id, email: user.email });
    }

    reply.send({
      message: "If the email exists, a reset code has been sent",
    });
  } catch (err: any) {
    logger.error("Request password reset error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Reset password using reset code
 */
export async function resetPassword(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { error, value } = resetPasswordSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { email, resetCode, newPassword } = value;

    const user = await User.findOne({ email });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Check if reset code matches
    if (user.passwordResetCode !== resetCode) {
      return reply.status(400).send({ error: "Invalid reset code" });
    }

    // Check if code has expired
    if (!user.passwordResetExpiry || new Date() > user.passwordResetExpiry) {
      return reply.status(400).send({ error: "Reset code has expired. Please request a new one." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear reset fields
    user.passwordResetCode = undefined;
    user.passwordResetExpiry = undefined;

    await user.save();

    logger.info("Password reset completed", { userId: user.id });
    reply.send({ message: "Password reset successfully" });
  } catch (err: any) {
    logger.error("Reset password error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Verify token from Authorization header and return user info
 */
export async function verifyToken(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key") as any;

    const user = await User.findById(decoded.id).populate("roles").select("-password");
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    reply.send({
      valid: true,
      user: {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        userType: user.userType,
        phone: user.phone,
        roles: user.roles,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Include Student-specific fields
        ...(user.userType === "Student" && {
          organization: (user as IStudent).organization,
        }),
        // Include OrgAdmin-specific fields
        ...(user.userType === "OrgAdmin" && {
          organization: (user as unknown as IOrgAdmin).organization,
        }),
      },
    });
  } catch (error) {
    console.error("Verify token error:", error);
    reply.status(401).send({ error: "Invalid token" });
  }
}

/**
 * Verify email using verification code
 */
export async function verifyEmail(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { error, value } = verifyEmailSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { email, verificationCode } = value;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Check if already verified
    if (user.isVerified) {
      return reply.status(400).send({ error: "Email is already verified" });
    }

    // Check if verification code exists
    if (!user.verificationCode) {
      return reply.status(400).send({
        error: "No verification code found. Please request a new one.",
      });
    }

    // Check if verification code has expired
    if (!user.verificationExpiry || new Date() > user.verificationExpiry) {
      return reply.status(400).send({
        error: "Verification code has expired. Please request a new one.",
      });
    }

    // Check verification attempts limit (max 5 attempts)
    if (user.verificationAttempts && user.verificationAttempts >= 5) {
      return reply.status(400).send({
        error: "Too many verification attempts. Please request a new code.",
      });
    }

    // Check if the verification code matches
    if (user.verificationCode !== verificationCode) {
      // Increment verification attempts
      user.verificationAttempts = (user.verificationAttempts || 0) + 1;
      await user.save();

      return reply.status(400).send({
        error: "Invalid verification code",
        attemptsRemaining: 5 - user.verificationAttempts,
      });
    }

    // Verify the user and clear verification fields
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    user.verificationAttempts = 0;
    await user.save();

    logger.info("Email verified successfully", { userId: user.id, email });
    reply.send({
      message: "Email verified successfully. You can now log in.",
      isVerified: true,
    });
  } catch (err: any) {
    logger.error("Verify email error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}

/**
 * Validate current session
 */
export async function validateSession(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = (request as any).user?.id;
    const sessionId = request.headers['x-session-id'] as string;

    if (!userId || !sessionId) {
      return reply.status(401).send({
        valid: false,
        message: "Missing user ID or session ID"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.status(404).send({
        valid: false,
        message: "User not found"
      });
    }

    // Check if session matches
    if (user.activeSessionId !== sessionId) {
      logger.warn("Session validation failed - session mismatch", {
        userId,
        activeSession: user.activeSessionId,
        requestSession: sessionId
      });

      return reply.status(403).send({
        valid: false,
        message: "Session invalid - logged in from another device"
      });
    }

    reply.send({
      valid: true,
      message: "Session is valid"
    });
  } catch (err: any) {
    logger.error("Validate session error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({
      valid: false,
      message: "Internal Server Error"
    });
  }
}

/**
 * Resend verification email
 */
export async function resendVerification(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { error, value } = resendVerificationSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { email } = value;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    // Check if already verified
    if (user.isVerified) {
      return reply.status(400).send({ error: "Email is already verified" });
    }

    // Check rate limiting
    if (!checkVerificationRateLimit(user)) {
      return reply.status(429).send({
        error:
          "Please wait at least 1 minute before requesting another verification code",
      });
    }

    // Generate a new verification code
    const newVerificationCode = generateVerificationCode();
    const newVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Update user with new verification code
    user.verificationCode = newVerificationCode;
    user.verificationExpiry = newVerificationExpiry;
    user.verificationAttempts = 0; // Reset attempts
    user.lastCodeSentAt = new Date();
    await user.save();

    // Send verification email
    const emailSent = await emailService.sendVerificationCode(
      user.email,
      user.fullname,
      newVerificationCode
    );

    if (!emailSent) {
      logger.error("Failed to resend verification email", {
        userId: user.id,
        email,
      });
      return reply.status(500).send({
        error: "Failed to send verification email. Please try again later.",
      });
    }

    logger.info("Verification email resent", { userId: user.id, email });
    reply.send({
      message: "Verification code sent successfully. Please check your email.",
      codeSent: true,
    });
  } catch (err: any) {
    logger.error("Resend verification error", {
      error: err.message,
      stack: err.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
}
