/**
 * Test Commission Listing - Admin Portal Debug
 * This script checks if multiple commissions show up for the same organization
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function testCommissionListing() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Commission = (await import("./src/models/Commission")).default;
    const Organization = (await import("./src/models/Organization")).default;

    // Find all organizations with commissions
    const orgs = await Organization.find({});
    console.log(`\n📊 Found ${orgs.length} organizations\n`);

    for (const org of orgs) {
      const commissions = await Commission.find({ organization: org._id })
        .sort({ createdAt: -1 });

      if (commissions.length > 0) {
        console.log(`\n🏢 Organization: ${org.name}`);
        console.log(`   ID: ${org._id}`);
        console.log(`   Total Commissions: ${commissions.length}\n`);

        commissions.forEach((comm, index) => {
          console.log(`   [${index + 1}] Commission ID: ${comm._id}`);
          console.log(`       Status: ${comm.status}`);
          console.log(`       Amount: ₹${comm.finalAmount}`);
          console.log(`       Purchases: ${comm.purchases?.length || 0}`);
          console.log(`       Period: ${comm.period?.startDate} to ${comm.period?.endDate}`);
          console.log(`       Created: ${comm.createdAt}`);
          console.log(`       Updated: ${comm.updatedAt}`);
          console.log();
        });
      }
    }

    // Test the admin portal query
    console.log("\n\n🔍 Testing Admin Portal Query (GET /commissions):\n");
    const allCommissions = await Commission.find({})
      .populate("organization", "name type")
      .sort({ "period.startDate": -1, createdAt: -1 });

    console.log(`Total commissions found: ${allCommissions.length}\n`);
    
    allCommissions.forEach((comm: any) => {
      console.log(`ID: ${comm._id}`);
      console.log(`Organization: ${comm.organization?.name || 'Unknown'}`);
      console.log(`Status: ${comm.status}`);
      console.log(`Amount: ₹${comm.finalAmount}`);
      console.log(`Purchases: ${comm.purchases?.length || 0}`);
      console.log(`Created: ${comm.createdAt}`);
      console.log(`---`);
    });

    // Check for any potential duplicates or merging issues
    console.log("\n\n🔎 Checking for potential issues:\n");
    
    const groupedByOrg = allCommissions.reduce((acc: any, comm: any) => {
      const orgId = comm.organization?._id?.toString() || comm.organization?.toString();
      if (!acc[orgId]) {
        acc[orgId] = [];
      }
      acc[orgId].push(comm);
      return acc;
    }, {});

    for (const [orgId, comms] of Object.entries(groupedByOrg)) {
      const commArray = comms as any[];
      if (commArray.length > 1) {
        console.log(`⚠️ Organization ${orgId} has ${commArray.length} commission records:`);
        commArray.forEach((c: any, i: number) => {
          console.log(`   [${i + 1}] ${c._id} - Status: ${c.status} - Amount: ₹${c.finalAmount} - Purchases: ${c.purchases?.length || 0}`);
        });
        console.log();
      }
    }

    await mongoose.disconnect();
    console.log("\n✅ Test complete");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testCommissionListing();
