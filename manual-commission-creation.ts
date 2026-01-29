/**
 * Manually trigger commission creation for a purchase
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function manualCommissionCreation() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Purchase = (await import("./src/models/Purchase")).default;
    const { updateCommissionForPurchase } = await import("./src/controllers/webhookController");

    const purchaseId = "6979d81d76202b2355fef725";
    
    const purchase = await Purchase.findById(purchaseId).populate("package");

    if (!purchase) {
      console.log("❌ Purchase not found!");
      return;
    }

    console.log("\n📦 Purchase found:");
    console.log(`  ID: ${purchase._id}`);
    console.log(`  Status: ${purchase.status}`);
    console.log(`  Amount: ₹${purchase.amount}`);

    console.log("\n🔄 Calling updateCommissionForPurchase()...\n");
    
    try {
      await updateCommissionForPurchase(purchase);
      console.log("\n✅ Commission creation completed!");
    } catch (error: any) {
      console.error("\n❌ Commission creation failed:", error);
      console.error("Error details:", error.message);
      console.error("Stack:", error.stack);
    }

    // Check if commission was created
    const Commission = (await import("./src/models/Commission")).default;
    const commission = await Commission.findOne({
      "purchases.purchase": purchase._id
    });

    if (commission) {
      console.log(`\n✅ Commission NOW EXISTS: ${commission._id}`);
      console.log(`  Status: ${commission.status}`);
      console.log(`  Amount: ₹${commission.finalAmount}`);
    } else {
      console.log("\n❌ Commission still doesn't exist after function call!");
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

manualCommissionCreation();
