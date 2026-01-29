import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';

async function createTestCommission() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('Organization:', org.name);
    console.log('Commission Rate:', org.commissionRate + '%');
    
    // Create a test commission for the current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const testCommission = new Commission({
      organization: org._id,
      period: {
        startDate,
        endDate,
        type: 'monthly',
      },
      purchases: [{
        purchase: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(),
        studentName: 'Test Student',
        packageName: 'Test Package',
        amount: 1000,
        commission: 50,
        purchaseDate: new Date(),
      }],
      payouts: [{
        purchaseId: new mongoose.Types.ObjectId(),
        amount: 50,
        status: 'pending',
        transactionId: null,
        paidAt: null,
        paymentMethod: null,
        notes: null,
        createdAt: new Date(),
      }],
      totalSales: 1000,
      purchaseCount: 1,
      commissionRate: org.commissionRate,
      baseCommission: 50,
      bonusCommission: 0,
      totalCommission: 50,
      minimumGuarantee: 0,
      finalAmount: 50,
      status: 'pending',
      paymentDetails: {
        transactionId: null,
        paidAt: null,
        paymentMethod: null,
        notes: null,
      },
      calculatedAt: new Date(),
      calculatedBy: null,
    });
    
    await testCommission.save();
    
    console.log('\n✅ Test commission created!');
    console.log('   ID:', testCommission._id);
    console.log('   Amount:', testCommission.finalAmount);
    console.log('   Status:', testCommission.status);
    console.log('\nCheck the admin portal at: http://localhost:3000/discounts/commissions');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

createTestCommission();
