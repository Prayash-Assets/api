import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Purchase from './src/models/Purchase';
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import DiscountApplication from './src/models/DiscountApplication';

async function manuallyCreateCommission() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔧 Manually Creating Commission for Purchase\n');
    
    // Get the purchase
    const purchase = await Purchase.findOne({ 
      razorpayPaymentId: 'pay_S8R1rENGUGrLFj' 
    });
    
    if (!purchase) {
      console.log('❌ Purchase not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📦 Purchase found:');
    console.log('   ID:', purchase._id);
    console.log('   User:', purchase.user);
    console.log('   Amount:', purchase.amount);
    console.log('   Status:', purchase.status);
    
    // Check if user belongs to an organization
    const orgMember = await OrganizationMember.findOne({
      user: purchase.user,
      status: { $in: ['active', 'registered'] }
    });
    
    if (!orgMember || !orgMember.organization) {
      console.log('❌ User not part of any organization');
      await mongoose.disconnect();
      return;
    }
    
    const org = await Organization.findById(orgMember.organization);
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n🏢 Organization:', org.name);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Get the discount application
    const discountApp = await DiscountApplication.findOne({
      purchase: purchase._id
    });
    
    const finalPrice = discountApp?.finalPrice || purchase.amount;
    const commissionAmount = (finalPrice * org.commissionRate) / 100;
    
    console.log('\n💰 Commission Calculation:');
    console.log('   Final Price:', finalPrice);
    console.log('   Commission:', commissionAmount);
    
    // Get the period
    const purchaseDate = new Date(purchase.createdAt);
    const startDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1);
    const endDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log('\n📅 Period:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
    
    // Find or create commission record
    let commission = await Commission.findOne({
      organization: org._id,
      'period.startDate': startDate,
      'period.endDate': endDate,
      'period.type': 'monthly',
    });
    
    if (!commission) {
      console.log('\n📝 Creating new commission record...');
      
      commission = new Commission({
        organization: org._id,
        period: {
          startDate,
          endDate,
          type: 'monthly',
        },
        purchases: [],
        payouts: [],
        totalSales: 0,
        purchaseCount: 0,
        commissionRate: org.commissionRate,
        baseCommission: 0,
        bonusCommission: 0,
        totalCommission: 0,
        minimumGuarantee: 0,
        finalAmount: 0,
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
    } else {
      console.log('\n📝 Updating existing commission record...');
    }
    
    // Add purchase
    (commission.purchases as any).push({
      purchase: purchase._id,
      user: purchase.user,
      studentName: orgMember.name,
      packageName: 'Package',
      amount: finalPrice,
      commission: commissionAmount,
      purchaseDate: purchase.createdAt,
    });
    
    // Add payout
    (commission.payouts as any).push({
      purchaseId: purchase._id,
      amount: commissionAmount,
      status: 'pending',
      transactionId: null,
      paidAt: null,
      paymentMethod: null,
      notes: null,
      createdAt: purchase.createdAt,
    });
    
    // Update totals
    commission.totalSales = (commission.totalSales || 0) + finalPrice;
    commission.purchaseCount = (commission.purchaseCount || 0) + 1;
    commission.baseCommission = (commission.baseCommission || 0) + commissionAmount;
    commission.totalCommission = commission.baseCommission + (commission.bonusCommission || 0);
    commission.finalAmount = Math.max(commission.totalCommission, commission.minimumGuarantee || 0);
    commission.status = 'pending';
    
    await commission.save();
    
    console.log('\n✅ Commission record created successfully!');
    console.log('   ID:', commission._id);
    console.log('   Total Sales: ₹' + commission.totalSales);
    console.log('   Total Commission: ₹' + commission.finalAmount);
    console.log('   Payouts:', commission.payouts.length);
    console.log('\n💡 View in admin portal: http://localhost:3000/discounts/commissions\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

manuallyCreateCommission();
