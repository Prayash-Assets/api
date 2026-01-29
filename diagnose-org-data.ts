import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import Purchase from './src/models/Purchase';
import User from './src/models/User';

async function diagnoseOrganization() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n📊 DIAGNOSING ORGANIZATION DATA\n');
    
    // Get the organization
    const org = await Organization.findOne({ name: 'Abc' });
    
    if (!org) {
      console.log('❌ Organization "Abc" not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📍 Organization: Abc');
    console.log('   ID:', org._id);
    console.log('   Seat Count:', org.seatCount);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Get all organization members
    console.log('\n👥 ALL Organization Members:');
    const members = await OrganizationMember.find({ organization: org._id });
    console.log('   Total Members:', members.length);
    
    members.forEach((member: any, index: number) => {
      console.log(`\n   Member ${index + 1}:`);
      console.log('      ID:', member._id);
      console.log('      User ID:', member.user);
      console.log('      Status:', member.status);
      console.log('      totalSpent:', member.totalSpent);
      console.log('      totalPurchases:', member.totalPurchases);
    });
    
    // Get aggregate stats (same as API endpoint)
    console.log('\n📈 AGGREGATE STATS (from API):');
    const memberStats = await OrganizationMember.aggregate([
      { $match: { organization: org._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalSpent: { $sum: "$totalSpent" },
          totalPurchases: { $sum: "$totalPurchases" },
        },
      },
    ]);
    
    console.log('   Raw Aggregate Results:');
    memberStats.forEach((stat: any) => {
      console.log(`      Status: ${stat._id}`);
      console.log(`         Count: ${stat.count}`);
      console.log(`         totalSpent: ₹${stat.totalSpent}`);
      console.log(`         totalPurchases: ${stat.totalPurchases}`);
    });
    
    // Calculate combined stats like API does
    const stats = {
      invited: 0,
      registered: 0,
      active: 0,
      removed: 0,
      totalSpent: 0,
      totalPurchases: 0,
    };
    memberStats.forEach((s: any) => {
      const statusKey = s._id as keyof typeof stats;
      if (stats[statusKey] !== undefined) {
        stats[statusKey] = s.count;
      }
      if (statusKey !== "removed") {
        stats.totalSpent += s.totalSpent || 0;
        stats.totalPurchases += s.totalPurchases || 0;
      }
    });
    
    console.log('\n💾 FINAL API RESPONSE STATS:');
    console.log('   totalSpent:', '₹' + stats.totalSpent);
    console.log('   totalPurchases:', stats.totalPurchases);
    console.log('   invited:', stats.invited);
    console.log('   registered:', stats.registered);
    console.log('   active:', stats.active);
    console.log('   removed:', stats.removed);
    
    // Check actual purchases
    console.log('\n🛒 PURCHASES IN DATABASE:');
    const purchases = await Purchase.find({ 'razorpayPaymentId': { $exists: true, $ne: null } });
    console.log('   Total Captured Purchases:', purchases.length);
    purchases.forEach((p: any, idx: number) => {
      console.log(`   ${idx + 1}. User: ${p.user} - ₹${p.amount} (${p.status})`);
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

diagnoseOrganization();
