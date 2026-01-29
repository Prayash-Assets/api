import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import Purchase from './src/models/Purchase';
import DiscountApplication from './src/models/DiscountApplication';

async function generateCommissionsWithPayouts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🚀 Commission Generation (with Individual Payouts)\n');
    
    // Get the organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Get the current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log('\n📅 Period:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
    
    // Get all existing commissions for this organization to track which purchases already have commissions
    const existingCommissions = await Commission.find({
      organization: org._id,
    }).select('purchases.purchase payouts.purchaseId');
    
    // Build a set of purchase IDs that already have commission records
    const commissionedPurchaseIds = new Set<string>();
    for (const comm of existingCommissions) {
      // From purchases array
      comm.purchases?.forEach(p => {
        if (p.purchase) commissionedPurchaseIds.add(p.purchase.toString());
      });
      // From payouts array
      comm.payouts?.forEach(p => {
        if (p.purchaseId) commissionedPurchaseIds.add(p.purchaseId.toString());
      });
    }
    
    console.log(`\n📋 Found ${commissionedPurchaseIds.size} purchase(s) already commissioned`);
    
    // Check if we're trying to regenerate - this should not happen with proper usage
    const existing = await Commission.findOne({
      organization: org._id,
      'period.startDate': startDate,
      'period.endDate': endDate,
      'period.type': 'monthly',
      status: { $in: ['pending', 'processed'] } // Only allow updating pending/processed, not paid
    });
    
    if (existing) {
      console.log('\n⚠️  Commission already exists for this period');
      console.log('   Current payouts:', existing.payouts?.length || 0);
      console.log('\n🔄 REPROCESSING: Regenerating payouts from purchases...\n');
      
      console.log('⚠️  Pending/processed commission already exists for this period');
      console.log('   Status:', existing.status);
      console.log('   Use the admin portal to update or delete this commission first.\n');
      await mongoose.disconnect();
      return;
    }
    
    // Check if there's a paid commission for this period - never allow modifying paid records
    const paidCommission = await Commission.findOne({
      organization: org._id,
      'period.startDate': startDate,
      'period.endDate': endDate,
      'period.type': 'monthly',
      status: 'paid'
    });
    
    if (paidCommission) {
      console.log('⚠️  Paid commission already exists for this period');
      console.log('   Paid commissions cannot be modified.');
      console.log('   To generate commission for new purchases, they will be tracked separately.\n');
    }
    
    // Get members
    const members = await OrganizationMember.find({
      organization: org._id,
      status: { $in: ['active', 'registered'] }
    });
    
    const memberUserIds = members.map(m => m.user);
    
    // Get all purchases in this period that haven't been commissioned yet
    const purchases = await Purchase.find({
      user: { $in: memberUserIds },
      status: 'captured',
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 }).select('_id package amount user createdAt');
    
    // Filter out purchases that already have commissions
    const newPurchases = purchases.filter(p => 
      !commissionedPurchaseIds.has(p._id?.toString() || '')
    );
    
    console.log(`\n📦 Found ${purchases.length} total purchase(s) in period`);
    console.log(`   ${commissionedPurchaseIds.size} already commissioned`);
    console.log(`   ${newPurchases.length} new purchase(s) to commission:`);
    
    if (newPurchases.length === 0) {
      console.log('\n✅ No new purchases to commission. All purchases in this period are already commissioned.\n');
      await mongoose.disconnect();
      return;
    }
    
    let totalSales = 0;
    const purchaseDetails: any[] = [];
    const newPayouts: any[] = [];
    
    for (const purchase of newPurchases) {
        
        // Get the discount application
        const discountApp = await DiscountApplication.findOne({
          purchase: purchase._id
        }).select('finalPrice');
        
        const finalPrice = discountApp?.finalPrice || purchase.amount;
        const commission = finalPrice * (org.commissionRate / 100);
      
      totalSales += finalPrice;
      
      // Get member info
      const member = members.find(m => m.user?.toString() === purchase.user?.toString());
      
      purchaseDetails.push({
        purchase: purchase._id,
        user: purchase.user,
        studentName: member?.name || 'Unknown',
        packageName: 'Package',
        amount: finalPrice,
        commission,
        purchaseDate: purchase.createdAt,
      });
      
      newPayouts.push({
        purchaseId: purchase._id,
        amount: commission,
        status: 'pending',
        transactionId: null,
        paidAt: null,
        paymentMethod: null,
        notes: null,
        createdAt: purchase.createdAt,
      });
      
      console.log(`   ✓ ${member?.name || 'Unknown'} - ₹${finalPrice} = ₹${commission} commission`);
    }
    
    const baseCommission = totalSales * (org.commissionRate / 100);
    
    console.log('\n💰 Calculation:');
    console.log('   Total Sales:', totalSales);
    console.log('   Base Commission:', baseCommission.toFixed(2));
    console.log('   Payouts:', newPayouts.length);
    
    // Create NEW commission record for these purchases
    const commission = new Commission({
      organization: org._id,
      period: {
        startDate,
        endDate,
        type: 'monthly',
      },
      purchases: purchaseDetails,
      payouts: newPayouts,
      totalSales,
      purchaseCount: newPurchases.length,
      commissionRate: org.commissionRate,
      baseCommission,
      bonusCommission: 0,
      totalCommission: baseCommission,
      minimumGuarantee: 0,
      finalAmount: baseCommission,
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
    
    await commission.save();
    
    console.log('\n✅ New commission record created!');
    console.log('   ID:', commission._id);
    console.log('   Organization:', org.name);
    console.log('   Total Sales:', totalSales);
    console.log('   Commission Amount:', baseCommission.toFixed(2));
    console.log('   Individual Payouts:');
    newPayouts.forEach((p, i) => {
      console.log(`      ${i + 1}. ₹${p.amount} - ${p.status}`);
    });
    
    console.log('\n💡 View in admin portal: http://localhost:3000/discounts/commissions\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

generateCommissionsWithPayouts();
