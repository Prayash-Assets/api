import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';
import Purchase from './src/models/Purchase';
import DiscountApplication from './src/models/DiscountApplication';

async function splitCombinedCommissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🚀 Splitting Combined Commission Records\n');
    
    // Get the organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    
    // Get the current month commission record
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const existingCommission = await Commission.findOne({
      organization: org._id,
      'period.startDate': startDate,
      'period.endDate': endDate,
      'period.type': 'monthly',
    });
    
    if (!existingCommission) {
      console.log('❌ No commission record found for this period');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n📝 Current commission record:');
    console.log('   Purchases:', existingCommission.purchases.length);
    console.log('   Status:', existingCommission.status);
    console.log('   Total Sales:', existingCommission.totalSales);
    console.log('   Commission:', existingCommission.finalAmount);
    
    if (existingCommission.purchases.length <= 1) {
      console.log('\n⚠️  Commission has only 1 or fewer purchases. No need to split.');
      await mongoose.disconnect();
      return;
    }
    
    // Sort purchases by date
    const sortedPurchases = [...existingCommission.purchases].sort(
      (a: any, b: any) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
    );
    
    console.log('\n📦 Purchases in chronological order:');
    sortedPurchases.forEach((p: any, idx: number) => {
      console.log(`   ${idx + 1}. ${p.studentName} - ₹${p.amount} (Commission: ₹${p.commission}) - ${new Date(p.purchaseDate).toISOString()}`);
    });
    
    // The first purchase(s) should remain with the existing (paid) status
    // Subsequent purchases should create new commission records with pending status
    
    const purchasesForExisting = [sortedPurchases[0]]; // Keep first purchase with existing record
    const newPurchases = sortedPurchases.slice(1); // Rest will be new records
    
    console.log(`\n🔄 Planning to split:`);
    console.log(`   - Keep first purchase with EXISTING record (status: ${existingCommission.status})`);
    console.log(`   - Create ${newPurchases.length} NEW record(s) with status: pending`);
    
    // Update existing commission with only first purchase
    const firstPurchaseCommission = purchasesForExisting[0].commission;
    existingCommission.purchases = purchasesForExisting;
    existingCommission.totalSales = purchasesForExisting[0].amount;
    existingCommission.purchaseCount = 1;
    existingCommission.baseCommission = firstPurchaseCommission;
    existingCommission.totalCommission = firstPurchaseCommission;
    existingCommission.finalAmount = firstPurchaseCommission;
    
    await existingCommission.save();
    console.log('\n✅ Updated existing commission record:');
    console.log('   Purchases: 1');
    console.log('   Sales:', purchasesForExisting[0].amount);
    console.log('   Commission:', firstPurchaseCommission);
    console.log('   Status: ' + existingCommission.status);
    
    // Create new records for subsequent purchases
    for (let i = 0; i < newPurchases.length; i++) {
      const purchase = newPurchases[i];
      
      // Create a new commission record for this purchase
      const newCommission = new Commission({
        organization: org._id,
        period: {
          startDate,
          endDate,
          type: 'monthly',
        },
        purchases: [purchase],
        totalSales: purchase.amount,
        purchaseCount: 1,
        commissionRate: org.commissionRate,
        baseCommission: purchase.commission,
        bonusCommission: 0,
        totalCommission: purchase.commission,
        minimumGuarantee: 0,
        finalAmount: purchase.commission,
        status: 'pending', // New purchases start as pending
        paymentDetails: {
          transactionId: null,
          paidAt: null,
          paymentMethod: null,
          notes: null,
        },
        calculatedAt: new Date(),
        calculatedBy: null,
      });
      
      await newCommission.save();
      console.log(`\n✅ Created NEW commission record #${i + 1}:`);
      console.log('   ID:', newCommission._id);
      console.log('   Student:', purchase.studentName);
      console.log('   Sales:', purchase.amount);
      console.log('   Commission:', purchase.commission);
      console.log('   Status: pending');
    }
    
    console.log('\n\n📊 SUMMARY:');
    console.log('   ✅ Split ' + existingCommission.purchases.length + ' purchase(s) into separate records');
    console.log('   📌 Record 1: PAID status (₹' + firstPurchaseCommission + ')');
    console.log('   📌 Record(s) 2+: PENDING status (₹' + newPurchases.map((p: any) => p.commission).join(', ₹') + ')');
    console.log('\n💡 View in admin portal: http://localhost:3000/discounts/commissions\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

splitCombinedCommissions();
