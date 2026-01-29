import ReferralSettings from "../models/ReferralSettings";
import Admin from "../models/User";
import logger from "../config/logger";

export async function seedReferralSettings() {
  try {
    logger.info("Seeding referral settings...");

    // Check if settings already exist first
    const existingSettings = await ReferralSettings.findOne();

    if (existingSettings) {
      logger.info("Referral settings already exist.");
      return;
    }

    // Get any admin user (try both "Admin" and "admin" userType)
    const adminUser = await Admin.findOne({ 
      $or: [
        { userType: "Admin" },
        { userType: "admin" }
      ]
    });

    if (!adminUser) {
      logger.error(
        "No admin user found in database. Please create an admin user first."
      );
      return;
    }

    logger.info(`Found admin user: ${adminUser.email}`);

    await ReferralSettings.create({
      discountType: "flat", // Fixed INR amount
      referrerBenefit: 100, // Referrer gets ₹100 per referral
      refereeBenefit: 10, // Referee (new student) gets 10% discount
      isActive: true, // Program is active by default
      maxUsagePerCode: null, // Unlimited usage
      validityDays: null, // No expiry
      minPurchaseAmount: 0, // Can be used on any purchase
      updatedBy: adminUser._id,
    });
    logger.info("Referral settings seeded successfully with default values.");
  } catch (error: any) {
    logger.error("Error seeding referral settings:", error);
  }
}
