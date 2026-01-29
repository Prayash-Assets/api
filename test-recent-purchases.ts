/**
 * Test Recent Purchases - Check if webhook created commission
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function testRecentPurchases() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Purchase = (await import("./src/models/Purchase")).default;
    const Commission = (await import("./src/models/Commission")).default;
    const User = (await import("./src/models/User")).default;
    const Package = (await import("./src/models/Package")).default;

    // Find recent purchases (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentPurchases = await Purchase.find({
      createdAt: { $gte: twoHoursAgo },
      status: "captured"
    })
      .populate("user", "fullname email")
      .populate("package", "name")
      .sort({ createdAt: -1 });

    console.log(`\n📦 Found ${recentPurchases.length} captured purchases in last 2 hours:\n`);

    for (const purchase of recentPurchases) {
      const user = purchase.user as any;
      const pkg = purchase.package as any;
      
      console.log(`Purchase ID: ${purchase._id}`);
      console.log(`  User: ${user?.fullname} (${user?.email})`);
      console.log(`  Package: ${pkg?.name}`);
      console.log(`  Amount: ₹${purchase.amount}`);
      console.log(`  Status: ${purchase.status}`);
      console.log(`  Payment ID: ${purchase.razorpayPaymentId}`);
      console.log(`  Created: ${purchase.createdAt}`);

      // Check if this purchase has a commission
      const commissionForPurchase = await Commission.findOne({
        "purchases.purchase": purchase._id
      });

      if (commissionForPurchase) {
        console.log(`  ✅ Commission exists: ${commissionForPurchase._id} (Status: ${commissionForPurchase.status})`);
      } else {
        console.log(`  ❌ NO COMMISSION FOUND FOR THIS PURCHASE!`);
      }
      console.log();
    }

    // Check all commissions for the organization
    const allCommissions = await Commission.find({})
      .populate("organization", "name")
      .sort({ createdAt: -1 });

    console.log(`\n📊 All Commissions in Database: ${allCommissions.length}\n`);
    
    allCommissions.forEach((comm: any) => {
      console.log(`Commission ID: ${comm._id}`);
      console.log(`  Organization: ${comm.organization?.name}`);
      console.log(`  Status: ${comm.status}`);
      console.log(`  Amount: ₹${comm.finalAmount}`);
      console.log(`  Purchases in commission: ${comm.purchases?.length || 0}`);
      console.log(`  Period: ${comm.period?.startDate} to ${comm.period?.endDate}`);
      console.log(`  Created: ${comm.createdAt}`);
      console.log(`  Updated: ${comm.updatedAt}`);
      
      if (comm.purchases && comm.purchases.length > 0) {
        console.log(`  Purchase IDs in this commission:`);
        comm.purchases.forEach((p: any, i: number) => {
          console.log(`    [${i + 1}] ${p.purchase} - ₹${p.amount} - ${p.studentName}`);
        });
      }
      console.log();
    });

    await mongoose.disconnect();
    console.log("✅ Test complete");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testRecentPurchases();
