import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function checkCommission() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    const commission = await Commission.findOne({
      organization: org?._id
    });
    
    if (!commission) {
      console.log('No commission found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n📋 Commission Record:');
    console.log('   Organization:', commission.organization);
    console.log('   Total Sales:', commission.totalSales);
    console.log('   Status:', commission.status);
    console.log('\n📦 Purchases:', commission.purchases?.length || 0);
    commission.purchases?.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ${p.studentName} - ₹${p.amount} = ₹${p.commission} (${p.purchaseDate})`);
    });
    
    console.log('\n💸 Payouts:', commission.payouts?.length || 0);
    commission.payouts?.forEach((p: any, i: number) => {
      console.log(`   ${i + 1}. ₹${p.amount} - ${p.status} (Purchase ID: ${p.purchaseId})`);
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkCommission();
