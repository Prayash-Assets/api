import Purchase from "../models/Purchase";
import Package from "../models/Package";
import { Admin, Student } from "../models/User";
import logger from "../config/logger";

export async function seedPurchases() {
  try {
    logger.info("Seeding sample purchases...");

    // Check if purchases already exist
    const existingPurchases = await Purchase.countDocuments();
    if (existingPurchases > 0) {
      logger.info("Purchases already exist. Skipping seed.");
      return;
    }

    // Get sample users
    const adminUser = await Admin.findOne({ email: "admin@example.com" });
    const studentUser = await Student.findOne().limit(1);

    // Get sample packages
    const packages = await Package.find().limit(3);

    if (!packages.length) {
      logger.warn("No packages found. Cannot seed purchases.");
      return;
    }

    // Create sample purchases with different statuses
    const samplePurchases = [
      {
        user: studentUser?._id || adminUser?._id,
        package: packages[0]._id,
        razorpayPaymentId: "pay_sample_001",
        razorpayOrderId: "order_sample_001",
        razorpaySignature: "signature_sample_001",
        amount: packages[0].price || 999,
        currency: "INR",
        status: "captured",
        orderDetails: {
          packageName: packages[0].name,
          packageDescription: packages[0].description,
          customerEmail:
            (studentUser || adminUser)?.email || "student@example.com",
          customerName:
            (studentUser || adminUser)?.fullname || "Sample Student",
          customerPhone: "9876543210",
        },
      },
      {
        user: studentUser?._id || adminUser?._id,
        package: packages[1]?._id || packages[0]._id,
        razorpayPaymentId: "pay_sample_002",
        razorpayOrderId: "order_sample_002",
        razorpaySignature: "signature_sample_002",
        amount: packages[1]?.price || 1999,
        currency: "INR",
        status: "captured",
        orderDetails: {
          packageName: packages[1]?.name || packages[0].name,
          packageDescription:
            packages[1]?.description || packages[0].description,
          customerEmail:
            (studentUser || adminUser)?.email || "student@example.com",
          customerName:
            (studentUser || adminUser)?.fullname || "Sample Student",
          customerPhone: "9876543210",
        },
      },
      {
        user: studentUser?._id || adminUser?._id,
        package: packages[2]?._id || packages[0]._id,
        razorpayPaymentId: "",
        razorpayOrderId: "order_sample_003",
        amount: packages[2]?.price || 799,
        currency: "INR",
        status: "failed",
        orderDetails: {
          packageName: packages[2]?.name || packages[0].name,
          packageDescription:
            packages[2]?.description || packages[0].description,
          customerEmail:
            (studentUser || adminUser)?.email || "student@example.com",
          customerName:
            (studentUser || adminUser)?.fullname || "Sample Student",
          customerPhone: "9876543210",
        },
      },
    ];

    // Create the purchases
    for (const purchaseData of samplePurchases) {
      await Purchase.create(purchaseData);
      logger.info(
        `Sample purchase created for package: ${purchaseData.orderDetails.packageName}`
      );
    }

    logger.info("Sample purchases seeded successfully.");
  } catch (error: any) {
    logger.error("Error seeding purchases:", error);
  }
}
