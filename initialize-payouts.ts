import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function initializePayoutsFromPurchases() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🚀 Initializing Payouts from Purchases\n');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    const commission = await Commission.findOne({
      organization: org?._id
    });
    
    if (!commission) {
      console.log('❌ No commission found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📋 Current Commission:');
    console.log('   Purchases:', commission.purchases?.length || 0);
    console.log('   Payouts:', commission.payouts?.length || 0);
    console.log('   Status:', commission.status);
    
    if (!commission.purchases || commission.purchases.length === 0) {
      console.log('\n❌ No purchases found. Cannot initialize payouts.');
      await mongoose.disconnect();
      return;
    }
    
    // If status is paid, first purchase is paid, rest are pending
    // If status is processed/pending, all are pending
    const payouts: any[] = [];
    
    commission.purchases.forEach((purchase: any, idx: number) => {
      let payoutStatus = 'pending';
      let paidAt = null;
      
      // If commission is marked as paid, first purchase is paid
      if (commission.status === 'paid' && idx === 0) {
        payoutStatus = 'paid';
        paidAt = commission.paymentDetails?.paidAt || commission.processedAt || new Date();
      }
      
      payouts.push({
        purchaseId: purchase.purchase,
        amount: purchase.commission,
        status: payoutStatus,
        transactionId: commission.paymentDetails?.transactionId || null,
        paidAt,
        paymentMethod: commission.paymentDetails?.paymentMethod || null,
        notes: commission.paymentDetails?.notes || null,
        createdAt: purchase.purchaseDate,
      });
    });
    
    console.log('\n💸 Creating Payouts:');
    payouts.forEach((p, i) => {
      console.log(`   ${i + 1}. ₹${p.amount} - ${p.status}`);
    });
    
    commission.payouts = payouts;
    await commission.save();
    
    console.log('\n✅ Payouts initialized successfully!');
    console.log('   Total Payouts:', payouts.length);
    console.log('   Paid Payouts:', payouts.filter(p => p.status === 'paid').length);
    console.log('   Pending Payouts:', payouts.filter(p => p.status === 'pending').length);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

initializePayoutsFromPurchases();
