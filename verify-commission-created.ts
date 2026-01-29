import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function verifyCommission() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n✅ Verifying Commission Record\n');
    
    // Get the organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    // Get the latest commission for this organization
    const commission = await Commission.findOne({
      organization: org._id
    }).populate('organization', 'name commissionRate').sort({ createdAt: -1 });
    
    if (!commission) {
      console.log('❌ No commission record found for this organization');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📋 Commission Details:');
    console.log('   Organization:', org.name);
    console.log('   Period:', commission.period?.type, '(' + commission.period?.startDate?.toISOString().split('T')[0] + ' to ' + commission.period?.endDate?.toISOString().split('T')[0] + ')');
    console.log('   Status:', commission.status);
    console.log('   Total Sales:', commission.totalSales);
    console.log('   Commission Rate:', org.commissionRate + '%');
    console.log('   Base Commission:', commission.baseCommission);
    console.log('   Final Amount:', commission.finalAmount);
    console.log('   Purchase Count:', commission.purchaseCount);
    console.log('   Created At:', commission.createdAt);
    
    console.log('\n✅ Commission is ready to view in admin portal!');
    console.log('   Portal: http://localhost:3000/discounts/commissions\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

verifyCommission();
