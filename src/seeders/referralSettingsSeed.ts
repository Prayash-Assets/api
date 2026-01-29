import ReferralSettings from "../models/ReferralSettings";
import Admin from "../models/User";
import logger from "../config/logger";

export async function seedReferralSettings() {
  try {
    logger.info("Seeding referral settings...");

    // Get the first admin user to set as updatedBy
    const adminUser = await Admin.findOne({ userType: "Admin" });
    if (!adminUser) {
      logger.error(
        "No admin user found. Please seed admin user first."
      );
      return;
    }

    // Check if settings already exist
    const existingSettings = await ReferralSettings.findOne();

    if (!existingSettings) {
      await ReferralSettings.create({
        discountType: "percentage", // or "flat" for INR
        referrerBenefit: 10, // Referrer gets 10% discount
        refereeBenefit: 10, // Referee (new student) gets 10% discount
        isActive: true, // Program is active by default
        maxUsagePerCode: null, // Unlimited usage
        validityDays: null, // No expiry
        minPurchaseAmount: 0, // Can be used on any purchase
        updatedBy: adminUser._id,
      });
      logger.info("Referral settings seeded successfully with default values.");
    } else {
      logger.info("Referral settings already exist.");
    }
  } catch (error: any) {
    logger.error("Error seeding referral settings:", error);
  }
}
