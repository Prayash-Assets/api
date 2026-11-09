import Role from "../models/Role";
import logger from "../config/logger";

/**
 * Role.name values are lowercase identifiers used for Role documents.
 * User.userType remains PascalCase ("Admin" | "Student" | "OrgAdmin").
 * Auth/RBAC middleware compares with .toLowerCase() — keep both conventions
 * intentional and stable.
 */
const rolesToSeed = [
  { name: "admin" },
  { name: "student" },
  { name: "orgadmin" },
];

export async function seedRoles() {
  try {
    logger.info("Seeding roles...");
    for (const roleData of rolesToSeed) {
      const existing = await Role.findOne({
        name: new RegExp(`^${roleData.name}$`, "i"),
      });
      if (!existing) {
        await Role.create(roleData);
        logger.info(`Role '${roleData.name}' seeded.`);
      } else if (existing.name !== roleData.name) {
        existing.name = roleData.name;
        await existing.save();
        logger.info(`Role normalized to '${roleData.name}'.`);
      } else {
        logger.info(`Role '${roleData.name}' already exists.`);
      }
    }
    logger.info("Role seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding roles:", error);
  }
}
