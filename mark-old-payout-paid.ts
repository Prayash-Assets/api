import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function markOldPayoutAsPaid() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔄 Marking Old Payout as Paid\n');
    
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
    console.log('   Total Sales:', commission.totalSales);
    console.log('   Status:', commission.status);
    console.log('\n💸 Payouts BEFORE:');
    commission.payouts?.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ₹${p.amount} - ${p.status} (Created: ${new Date(p.createdAt).toLocaleString()})`);
    });
    
    if (!commission.payouts || commission.payouts.length < 2) {
      console.log('\n❌ Not enough payouts to mark');
      await mongoose.disconnect();
      return;
    }
    
    // Sort payouts by creation date to find the older one
    const sortedPayouts = [...commission.payouts].sort((a: any, b: any) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // Mark the older one (₹99.75 ≈ ₹100) as paid
    const olderPayoutIndex = commission.payouts.findIndex((p: any) => 
      p.createdAt === sortedPayouts[0].createdAt
    );
    
    if (olderPayoutIndex !== -1) {
      commission.payouts[olderPayoutIndex].status = 'paid';
      commission.payouts[olderPayoutIndex].paidAt = new Date();
      commission.payouts[olderPayoutIndex].transactionId = 'TXN_PREVIOUS_PAYMENT';
      commission.payouts[olderPayoutIndex].paymentMethod = 'Bank Transfer';
      
      // Update overall status to "processed" since we have both paid and pending
      commission.status = 'processed';
      
      await commission.save();
      
      console.log('\n✅ Updated Successfully!\n');
      console.log('💸 Payouts AFTER:');
      commission.payouts.forEach((p: any, i: number) => {
        console.log(`   ${i + 1}. ₹${p.amount} - ${p.status} (Created: ${new Date(p.createdAt).toLocaleString()})`);
      });
      
      const paidTotal = commission.payouts
        .filter((p: any) => p.status === 'paid')
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      
      const pendingTotal = commission.payouts
        .filter((p: any) => p.status === 'pending')
        .reduce((sum: number, p: any) => sum + p.amount, 0);
      
      console.log('\n📊 Summary:');
      console.log('   💚 Paid Commission: ₹' + paidTotal.toFixed(2));
      console.log('   ⏳ Pending Commission: ₹' + pendingTotal.toFixed(2));
      console.log('   💰 Total Commission: ₹' + (paidTotal + pendingTotal).toFixed(2));
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

markOldPayoutAsPaid();
