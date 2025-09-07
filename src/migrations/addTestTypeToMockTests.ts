// Migration script to add testType field to existing MockTest documents
// Run this script once to migrate existing data

import mongoose from "mongoose";
import { MockTest, TestType } from "../models/MockTest";
import logger from "../config/logger";

const migrateTestTypes = async () => {
  try {
    logger.info("Starting MockTest testType migration...");

    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(
        process.env.MONGODB_URI || "mongodb://localhost:27017/prayashApi"
      );
    }

    // Find all MockTests that don't have a testType field
    const mockTestsToUpdate = await MockTest.find({
      testType: { $exists: false },
    });

    logger.info(`Found ${mockTestsToUpdate.length} MockTests to migrate`);

    if (mockTestsToUpdate.length === 0) {
      logger.info(
        "No MockTests need migration. All records already have testType field."
      );
      return;
    }

    // Update all existing MockTests to have default testType of "Mock Test"
    const updateResult = await MockTest.updateMany(
      { testType: { $exists: false } },
      { $set: { testType: TestType.MOCK_TEST } }
    );

    logger.info(
      `Migration completed successfully. Updated ${updateResult.modifiedCount} MockTest records.`
    );

    // Verify the migration
    const verificationCount = await MockTest.countDocuments({
      testType: { $exists: true },
    });

    const totalCount = await MockTest.countDocuments();

    logger.info(
      `Verification: ${verificationCount}/${totalCount} MockTests now have testType field`
    );

    if (verificationCount === totalCount) {
      logger.info(
        "✅ Migration completed successfully - all MockTests now have testType field"
      );
    } else {
      logger.warn(
        "⚠️ Migration may be incomplete - some MockTests still missing testType field"
      );
    }
  } catch (error) {
    logger.error("Error during MockTest testType migration:", error);
    throw error;
  }
};

// Export for use in other scripts
export { migrateTestTypes };

// If running this file directly
if (require.main === module) {
  migrateTestTypes()
    .then(() => {
      logger.info("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Migration script failed:", error);
      process.exit(1);
    });
}
