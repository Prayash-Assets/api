import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Purchase from './src/models/Purchase';
import Package from './src/models/Package';
import OrganizationMember from './src/models/OrganizationMember';
import Organization from './src/models/Organization';
import Commission from './src/models/Commission';
import { updateCommissionForPurchase } from './src/controllers/webhookController';

async function diagnoseRealPurchase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔍 Diagnosing Real Purchase\n');
    
    // Get the specific purchase
    const purchaseId = '6979a311166078528712224d';
    const purchase = await Purchase.findById(purchaseId);
    
    if (!purchase) {
      console.log('❌ Purchase not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📦 Purchase Details:');
    console.log('   ID:', purchase._id);
    console.log('   User ID:', purchase.user);
    console.log('   Amount: ₹' + purchase.amount);
    console.log('   Status:', purchase.status);
    console.log('   Created:', purchase.createdAt);
    console.log('   Package ID:', purchase.package);
    
    // Check if user is an organization member
    const orgMember = await OrganizationMember.findOne({
      user: purchase.user,
      status: { $in: ['active', 'registered'] }
    }).populate('organization');
    
    if (!orgMember) {
      console.log('\n❌ User is NOT a member of any organization');
      console.log('   Commission cannot be created - user must be an organization member');
      console.log('\n💡 To fix:');
      console.log('   1. Add this user to an organization');
      console.log('   2. Set their status to "active" or "registered"');
      console.log('   3. Then run commission generation manually');
      await mongoose.disconnect();
      return;
    }
    
    const org = orgMember.organization as any;
    console.log('\n✅ User IS a member of organization');
    console.log('   Organization:', org.name);
    console.log('   Organization ID:', org._id);
    console.log('   Member Status:', orgMember.status);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Check if commission already exists
    const existingCommission = await Commission.findOne({
      'purchases.purchase': purchase._id
    });
    
    if (existingCommission) {
      console.log('\n✅ Commission already exists for this purchase');
      console.log('   Commission ID:', existingCommission._id);
      console.log('   Status:', existingCommission.status);
      console.log('   Amount:', existingCommission.finalAmount);
    } else {
      console.log('\n⚠️  NO commission found for this purchase');
      console.log('   This is the problem - commission should have been created automatically');
      console.log('\n🔧 Attempting to generate commission now...');
      
      // Manually trigger commission generation
      await updateCommissionForPurchase(purchase);
      
      // Check if it was created
      const newCommission = await Commission.findOne({
        'purchases.purchase': purchase._id
      });
      
      if (newCommission) {
        console.log('\n✅ Commission created successfully!');
        console.log('   Commission ID:', newCommission._id);
        console.log('   Status:', newCommission.status);
        console.log('   Amount: ₹' + newCommission.finalAmount);
      } else {
        console.log('\n❌ Commission creation failed');
        console.log('   Check the logs above for errors');
      }
    }
    
    // Show all commissions for this org
    const allCommissions = await Commission.find({
      organization: org._id
    }).sort({ createdAt: -1 });
    
    console.log('\n📊 All commissions for', org.name + ':');
    console.log('   Total:', allCommissions.length);
    allCommissions.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c._id} - Status: ${c.status} - Amount: ₹${c.finalAmount} - Purchases: ${c.purchaseCount}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Diagnosis complete\n');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

diagnoseRealPurchase();
