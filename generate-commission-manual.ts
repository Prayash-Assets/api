import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import Purchase from './src/models/Purchase';
import DiscountApplication from './src/models/DiscountApplication';
import User from './src/models/User';

async function generateCommissionFromMembers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🚀 Commission Generation (from OrganizationMember data)');
    console.log('==============================================\n');
    
    // Get the organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Get the month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log('\n📅 Period:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
    
    // Check if commission already exists
    const existing = await Commission.findOne({
      organization: org._id,
      'period.startDate': startDate,
      'period.endDate': endDate,
      'period.type': 'monthly',
    });
    
    if (existing) {
      console.log('⚠️  Commission already exists for this period (Status:', existing.status + ')');
      await mongoose.disconnect();
      return;
    }
    
    // Get members of the organization
    const members = await OrganizationMember.find({
      organization: org._id,
      status: { $in: ['active', 'registered'] },
      totalSpent: { $gt: 0 }
    });
    
    console.log('\n👥 Active members with purchases:', members.length);
    
    let totalSales = 0;
    const purchaseDetails: any[] = [];
    
    // For each member, find their actual purchases in this period
    for (const member of members) {
      const memberPurchases = await Purchase.find({
        user: member.user,
        status: 'captured',
        createdAt: { $gte: startDate, $lte: endDate }
      }).select('_id package amount user createdAt discountApplication');
      
      for (const purchase of memberPurchases) {
        // Get the discount application to find final price
        const discountApp = await DiscountApplication.findOne({
          purchase: purchase._id
        }).select('finalPrice');
        
        const finalPrice = discountApp?.finalPrice || purchase.amount;
        
        totalSales += finalPrice;
        purchaseDetails.push({
          purchase: purchase._id,
          user: purchase.user,
          studentName: member.name,
          packageName: 'Package',
          amount: finalPrice,
          commission: finalPrice * (org.commissionRate / 100),
          purchaseDate: purchase.createdAt,
        });
      }
      
      console.log('  -', member.name, '- Purchases:', memberPurchases.length, '- Total:', memberPurchases.reduce((sum, p: any) => {
        return sum + (p.discountApplication ? 0 : p.amount); // Will be fixed in next iteration
      }, 0));
    }
    
    if (totalSales === 0) {
      console.log('\n❌ No purchases found in this period');
      await mongoose.disconnect();
      return;
    }
    
    const baseCommission = totalSales * (org.commissionRate / 100);
    
    console.log('\n💰 Calculation:');
    console.log('   Total Sales:', totalSales);
    console.log('   Commission Rate:', org.commissionRate + '%');
    console.log('   Commission Amount:', baseCommission.toFixed(2));
    
    // Create commission record
    const commission = await Commission.create({
      organization: org._id,
      period: {
        startDate,
        endDate,
        type: 'monthly',
      },
      purchases: purchaseDetails,
      totalSales,
      purchaseCount: purchaseDetails.length,
      commissionRate: org.commissionRate,
      baseCommission,
      bonusCommission: 0,
      totalCommission: baseCommission,
      minimumGuarantee: 0,
      finalAmount: baseCommission,
      status: 'pending',
      calculatedAt: new Date(),
      calculatedBy: null,
    });
    
    console.log('\n✅ Commission record created successfully!');
    console.log('   ID:', commission._id);
    console.log('   Status: pending');
    console.log('\n💡 View in admin portal: http://localhost:3000/discounts/commissions\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

generateCommissionFromMembers();
