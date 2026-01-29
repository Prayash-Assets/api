/**
 * Check if user belongs to organization
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";

async function checkUserOrganization() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const Purchase = (await import("./src/models/Purchase")).default;
    const OrganizationMember = (await import("./src/models/OrganizationMember")).default;
    const User = (await import("./src/models/User")).default;
    const Organization = (await import("./src/models/Organization")).default;

    const purchaseId = "6979d81d76202b2355fef725";
    
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      console.log("❌ Purchase not found!");
      return;
    }

    const userId = purchase.user;
    console.log(`\n👤 User ID from purchase: ${userId}`);

    const user = await User.findById(userId);
    console.log(`\n📧 User: ${user?.fullname} (${user?.email})`);

    // Check organization membership
    const orgMember = await OrganizationMember.findOne({
      user: userId,
      status: { $in: ['active', 'registered'] }
    }).populate('organization');

    if (orgMember) {
      console.log(`\n✅ User IS a member of an organization:`);
      console.log(`  Organization: ${(orgMember.organization as any)?.name}`);
      console.log(`  Status: ${orgMember.status}`);
      console.log(`  Member Name: ${orgMember.name}`);
    } else {
      console.log(`\n❌ User is NOT a member of any organization!`);
      console.log(`   This is why no commission was created!`);
      
      // Check all organization members to see who belongs
      const allMembers = await OrganizationMember.find({})
        .populate('organization', 'name')
        .populate('user', 'fullname email');
      
      console.log(`\n📊 All organization members (${allMembers.length}):`);
      allMembers.forEach((member: any) => {
        console.log(`  - ${member.user?.fullname} (${member.user?.email}) → ${member.organization?.name} [${member.status}]`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkUserOrganization();
