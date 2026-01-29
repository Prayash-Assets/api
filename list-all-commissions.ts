import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function listAllCommissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    const commissions = await Commission.find({
      organization: org?._id
    }).sort({ createdAt: -1 });
    
    console.log('\n📋 All Commission Records for Abc:\n');
    
    commissions.forEach((commission, idx) => {
      console.log(`\n=== Record ${idx + 1} ===`);
      console.log('   ID:', commission._id);
      console.log('   Period:', commission.period.startDate.toISOString().split('T')[0], 'to', commission.period.endDate.toISOString().split('T')[0]);
      console.log('   Total Sales:', commission.totalSales);
      console.log('   Status:', commission.status);
      console.log('   Purchases:', commission.purchases?.length || 0);
      commission.purchases?.forEach((p: any, i: number) => {
        console.log(`      ${i + 1}. ${p.studentName} - ₹${p.amount} = ₹${p.commission}`);
      });
      console.log('   Payouts:', commission.payouts?.length || 0);
      commission.payouts?.forEach((p: any, i: number) => {
        console.log(`      ${i + 1}. ₹${p.amount} - ${p.status}`);
      });
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

listAllCommissions();
