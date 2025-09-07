import Role from "../models/Role";
import logger from "../config/logger";

const rolesToSeed = [{ name: "admin" }, { name: "student" }];

export async function seedRoles() {
  try {
    logger.info("Seeding roles...");
    for (const roleData of rolesToSeed) {
      const existing = await Role.findOne({ name: roleData.name });
      if (!existing) {
        await Role.create(roleData);
        logger.info(`Role '${roleData.name}' seeded.`);
      } else {
        logger.info(`Role '${roleData.name}' already exists.`);
      }
    }
    logger.info("Role seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding roles:", error);
  }
}
