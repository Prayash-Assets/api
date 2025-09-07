import { Admin } from "../models/User";
import Role from "../models/Role";
import bcrypt from "bcryptjs";
import logger from "../config/logger";

export async function seedAdminUser() {
  try {
    logger.info("Seeding admin user...");
    const adminRole = await Role.findOne({ name: "admin" });
    if (!adminRole) {
      logger.error("Admin role not found. Seed roles first.");
      return;
    }
    const existing = await Admin.findOne({ email: "admin@example.com" });
    if (!existing) {
      // Hash the password before storing
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await Admin.create({
        fullname: "Admin User",
        email: "admin@example.com",
        password: hashedPassword,
        phone: 1234567890, // Required for Admin users
        address: "Admin Office Address",
        roles: [adminRole._id],
        userType: "Admin",
        isVerified: true, // Auto-verify admin users
      });
      logger.info("Admin user seeded successfully.");
    } else {
      logger.info("Admin user already exists.");
    }
  } catch (error: any) {
    logger.error("Error seeding admin user:", error);
  }
}
