/**
 * Check specific purchase details
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function checkPurchase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Purchase = (await import("./src/models/Purchase")).default;
    const Commission = (await import("./src/models/Commission")).default;
    const User = (await import("./src/models/User")).default;
    const Package = (await import("./src/models/Package")).default;

    const purchaseId = "6979d81d76202b2355fef725";
    
    const purchase = await Purchase.findById(purchaseId)
      .populate("user", "fullname email")
      .populate("package", "name price");

    if (!purchase) {
      console.log("❌ Purchase not found!");
      return;
    }

    console.log("\n📦 Purchase Details:");
    console.log(`  ID: ${purchase._id}`);
    console.log(`  User: ${(purchase.user as any)?.fullname}`);
    console.log(`  Package: ${(purchase.package as any)?.name}`);
    console.log(`  Amount: ₹${purchase.amount}`);
    console.log(`  Status: ${purchase.status}`);
    console.log(`  Payment ID: ${purchase.razorpayPaymentId}`);
    console.log(`  Order ID: ${purchase.razorpayOrderId}`);
    console.log(`  Created: ${purchase.createdAt}`);
    console.log(`  Updated: ${purchase.updatedAt}`);

    // Check if commission exists
    const commission = await Commission.findOne({
      "purchases.purchase": purchase._id
    });

    console.log(`\n💰 Commission Status: ${commission ? `EXISTS (ID: ${commission._id})` : '❌ NOT FOUND'}`);

    if (commission) {
      console.log(`  Status: ${commission.status}`);
      console.log(`  Amount: ₹${commission.finalAmount}`);
      console.log(`  Purchases in commission: ${commission.purchases?.length}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkPurchase();
