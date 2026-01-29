import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function fixPayoutStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔄 Fixing Payout Status\n');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    const commission = await Commission.findOne({
      organization: org?._id
    });
    
    if (!commission || !commission.payouts || commission.payouts.length !== 2) {
      console.log('❌ Commission not found or invalid payouts');
      await mongoose.disconnect();
      return;
    }
    
    console.log('Current payouts:');
    commission.payouts.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ₹${p.amount} - ${p.status}`);
    });
    
    // Find the ₹99.75 payout (≈₹100) - this should be paid
    // Find the ₹137.75 payout (≈₹138) - this should be pending
    const payout100Index = commission.payouts.findIndex((p: any) => 
      Math.round(p.amount) === 100 || p.amount === 99.75
    );
    
    const payout138Index = commission.payouts.findIndex((p: any) => 
      Math.round(p.amount) === 138 || p.amount === 137.75
    );
    
    if (payout100Index !== -1) {
      commission.payouts[payout100Index].status = 'paid';
      commission.payouts[payout100Index].paidAt = new Date();
      commission.payouts[payout100Index].transactionId = 'TXN_PREVIOUS_PAYMENT';
      commission.payouts[payout100Index].paymentMethod = 'Bank Transfer';
    }
    
    if (payout138Index !== -1) {
      commission.payouts[payout138Index].status = 'pending';
      commission.payouts[payout138Index].paidAt = null;
      commission.payouts[payout138Index].transactionId = null;
      commission.payouts[payout138Index].paymentMethod = null;
    }
    
    // Update overall status
    commission.status = 'processed'; // Both paid and pending exist
    
    await commission.save();
    
    console.log('\n✅ Fixed!\n');
    console.log('Updated payouts:');
    commission.payouts.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ₹${p.amount} - ${p.status}`);
    });
    
    const paidTotal = commission.payouts
      .filter((p: any) => p.status === 'paid')
      .reduce((sum: number, p: any) => sum + p.amount, 0);
    
    const pendingTotal = commission.payouts
      .filter((p: any) => p.status === 'pending')
      .reduce((sum: number, p: any) => sum + p.amount, 0);
    
    console.log('\n📊 Summary:');
    console.log('   💚 Paid Commission: ₹' + Math.round(paidTotal));
    console.log('   ⏳ Pending Commission: ₹' + Math.round(pendingTotal));
    console.log('   💰 Total Commission: ₹' + Math.round(paidTotal + pendingTotal));
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

fixPayoutStatus();
