import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Purchase from './src/models/Purchase';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import { updateCommissionForPurchase } from './src/controllers/webhookController';

/**
 * Test commission generation when a purchase is made
 * Simulates the webhook flow
 */
async function testCommissionGeneration() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🧪 Testing Commission Generation\n');
    
    // Get organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Get members
    const members = await OrganizationMember.find({
      organization: org._id,
      status: { $in: ['active', 'registered'] }
    });
    
    console.log('👥 Members:', members.length);
    
    if (members.length === 0) {
      console.log('❌ No members found');
      await mongoose.disconnect();
      return;
    }
    
    // Get a recent purchase for testing
    const memberIds = members.map(m => m.user);
    const recentPurchases = await Purchase.find({
      user: { $in: memberIds },
      status: 'captured'
    }).sort({ createdAt: -1 }).limit(5);
    
    console.log('\n📦 Recent Purchases:', recentPurchases.length);
    
    if (recentPurchases.length === 0) {
      console.log('❌ No captured purchases found');
      console.log('   Please make a test purchase first');
      await mongoose.disconnect();
      return;
    }
    
    // Show current commission state
    const currentCommissions = await Commission.find({
      organization: org._id
    }).sort({ createdAt: -1 });
    
    console.log('\n📋 Current Commission Records:', currentCommissions.length);
    currentCommissions.forEach((c, i) => {
      console.log(`   ${i + 1}. ID: ${c._id}`);
      console.log(`      Status: ${c.status}`);
      console.log(`      Amount: ₹${c.finalAmount}`);
      console.log(`      Purchases: ${c.purchaseCount}`);
      console.log(`      Period: ${new Date(c.period.startDate).toLocaleDateString()} - ${new Date(c.period.endDate).toLocaleDateString()}`);
    });
    
    // Test with the most recent purchase
    const testPurchase = recentPurchases[0];
    console.log('\n🔍 Testing with purchase:', testPurchase._id);
    console.log('   Amount:', testPurchase.amount);
    console.log('   Created:', testPurchase.createdAt?.toISOString());
    console.log('   Status:', testPurchase.status);
    
    // Check if this purchase already has a commission
    const existingCommission = await Commission.findOne({
      'purchases.purchase': testPurchase._id
    });
    
    if (existingCommission) {
      console.log('\n✅ This purchase already has a commission record');
      console.log('   Commission ID:', existingCommission._id);
      console.log('   Status:', existingCommission.status);
      console.log('   Amount:', existingCommission.finalAmount);
    } else {
      console.log('\n⚠️  This purchase does NOT have a commission record');
      console.log('   Running commission generation...');
      
      // Manually trigger commission generation
      await updateCommissionForPurchase(testPurchase);
      
      // Check again
      const newCommission = await Commission.findOne({
        'purchases.purchase': testPurchase._id
      });
      
      if (newCommission) {
        console.log('\n✅ Commission created successfully!');
        console.log('   Commission ID:', newCommission._id);
        console.log('   Status:', newCommission.status);
        console.log('   Amount:', newCommission.finalAmount);
      } else {
        console.log('\n❌ Commission was NOT created');
        console.log('   Check the logs above for errors');
      }
    }
    
    // Final summary
    const finalCommissions = await Commission.find({
      organization: org._id
    }).sort({ createdAt: -1 });
    
    console.log('\n📊 Final Commission Summary:');
    console.log('   Total Records:', finalCommissions.length);
    console.log('   Pending:', finalCommissions.filter(c => c.status === 'pending').length);
    console.log('   Processed:', finalCommissions.filter(c => c.status === 'processed').length);
    console.log('   Paid:', finalCommissions.filter(c => c.status === 'paid').length);
    
    const totalPending = finalCommissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.finalAmount, 0);
    const totalPaid = finalCommissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + c.finalAmount, 0);
    
    console.log('   Total Pending: ₹' + totalPending);
    console.log('   Total Paid: ₹' + totalPaid);
    
    await mongoose.disconnect();
    console.log('\n✅ Test completed\n');
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

testCommissionGeneration();
