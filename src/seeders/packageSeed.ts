import Package from "../models/Package";
import logger from "../config/logger";

export async function seedPackages() {
  try {
    logger.info("Seeding sample packages...");

    // Check if packages already exist
    const existingPackages = await Package.countDocuments();
    if (existingPackages > 0) {
      logger.info("Packages already exist. Skipping seed.");
      return;
    }

    const samplePackages = [
      {
        name: "Basic Test Package",
        description: "Essential mock tests for beginners",
        price: 999,
        duration: 30,
        published: true,
        publicView: true,
        draft: false,
        mockTests: [],
        files: [],
        links: [],
      },
      {
        name: "Advanced Test Package",
        description: "Comprehensive test suite for advanced learners",
        price: 1999,
        duration: 60,
        published: true,
        publicView: true,
        draft: false,
        mockTests: [],
        files: [],
        links: [],
      },
      {
        name: "Premium Test Package",
        description: "Complete test preparation with expert guidance",
        price: 2999,
        duration: 90,
        published: true,
        publicView: true,
        draft: false,
        mockTests: [],
        files: [],
        links: [],
      },
    ];

    for (const packageData of samplePackages) {
      await Package.create(packageData);
      logger.info(`Package '${packageData.name}' seeded.`);
    }

    logger.info("Package seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding packages:", error);
  }
}
