import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Purchase from './src/models/Purchase';
import Commission from './src/models/Commission';
import OrganizationMember from './src/models/OrganizationMember';
import { Result } from './src/models/Result';

async function cleanResetOrganization() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🧹 Starting Clean Reset of Organization Data\n');
    
    // Get the organization member
    const orgMember = await OrganizationMember.findOne({
      organization: { $exists: true, $ne: null }
    });
    
    if (!orgMember) {
      console.log('❌ No organization members found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👤 Organization Member:');
    console.log('   Name:', orgMember.name);
    console.log('   Email:', orgMember.email);
    console.log('   Current Total Spent: ₹' + (orgMember.totalSpent || 0));
    console.log('   Current Total Purchases:', orgMember.totalPurchases || 0);
    
    // Step 1: Delete all purchases for users in this organization
    console.log('\n📦 Step 1: Deleting Purchases...');
    const purchasesDeleted = await Purchase.deleteMany({
      user: orgMember.user
    });
    console.log('   ✅ Deleted', purchasesDeleted.deletedCount, 'purchases');
    
    // Step 2: Delete all results for users in this organization
    console.log('\n📊 Step 2: Deleting Results (Test Attempts)...');
    const resultsDeleted = await Result.deleteMany({
      user: orgMember.user
    });
    console.log('   ✅ Deleted', resultsDeleted.deletedCount, 'results');
    
    // Step 3: Reset OrganizationMember stats
    console.log('\n🔄 Step 3: Resetting OrganizationMember Stats...');
    await OrganizationMember.findByIdAndUpdate(
      orgMember._id,
      {
        totalSpent: 0,
        totalPurchases: 0,
        lastPurchaseDate: null
      }
    );
    console.log('   ✅ Reset totalSpent to ₹0');
    console.log('   ✅ Reset totalPurchases to 0');
    
    // Step 4: Delete all commission records for this organization
    console.log('\n💰 Step 4: Deleting Commission Records...');
    const commissionsDeleted = await Commission.deleteMany({
      organization: orgMember.organization
    });
    console.log('   ✅ Deleted', commissionsDeleted.deletedCount, 'commission records');
    
    // Verify reset
    console.log('\n✅ Clean Reset Complete!\n');
    console.log('📋 Verification:');
    
    const purchaseCount = await Purchase.countDocuments({ user: orgMember.user });
    const resultCount = await Result.countDocuments({ user: orgMember.user });
    const commissionCount = await Commission.countDocuments({ organization: orgMember.organization });
    const updatedMember = await OrganizationMember.findById(orgMember._id);
    
    console.log('   Purchases remaining:', purchaseCount);
    console.log('   Results remaining:', resultCount);
    console.log('   Commission records remaining:', commissionCount);
    console.log('   Organization Member totalSpent:', '₹' + (updatedMember?.totalSpent || 0));
    console.log('   Organization Member totalPurchases:', updatedMember?.totalPurchases || 0);
    
    console.log('\n🎉 Organization Dashboard should now show:');
    console.log('   ✅ Total Purchases: 0');
    console.log('   ✅ Total Revenue: ₹0');
    console.log('   ✅ Commission Earned: ₹0');
    console.log('   ✅ Admin Commission Page: Empty\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

cleanResetOrganization();
