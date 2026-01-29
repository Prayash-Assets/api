import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Organization from './src/models/Organization';
import Purchase from './src/models/Purchase';
import OrganizationMember from './src/models/OrganizationMember';

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    // Find org by contact person email
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    console.log('\n🔍 Organization Details:');
    if (org) {
      console.log('Name:', org.name);
      console.log('ID:', org._id);
      console.log('Commission Rate:', org.commissionRate);
      console.log('Status:', org.status);
      
      // Check OrganizationMember totalSpent (what dashboard uses)
      console.log('\n📊 Organization Member Stats:');
      const memberStats = await OrganizationMember.aggregate([
        { $match: { organization: org._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalSpent: { $sum: '$totalSpent' },
            totalPurchases: { $sum: '$totalPurchases' },
          },
        },
      ]);
      console.log('Member Stats:', JSON.stringify(memberStats, null, 2));
      
      const stats = {
        invited: 0,
        registered: 0,
        active: 0,
        removed: 0,
        totalSpent: 0,
        totalPurchases: 0,
      };
      memberStats.forEach((s: any) => {
        const statusKey = s._id as keyof typeof stats;
        if (stats[statusKey] !== undefined) {
          stats[statusKey] = s.count;
        }
        if (statusKey !== 'removed') {
          stats.totalSpent += s.totalSpent || 0;
          stats.totalPurchases += s.totalPurchases || 0;
        }
      });
      
      const dashboardCommission = (stats.totalSpent * org.commissionRate) / 100;
      console.log('\nDashboard View:');
      console.log('  Total Spent (from members):', stats.totalSpent);
      console.log('  Dashboard Commission:', dashboardCommission);
      
      // Find purchases for this org in current month
      console.log('\n📦 Purchases with organizationId:');
      const purchases = await Purchase.find({
        'discountApplication.organizationId': org._id,
        status: 'captured',
        createdAt: { $gte: new Date('2026-01-01'), $lte: new Date('2026-01-31') }
      }).populate('user', 'fullname').select('_id finalAmount user createdAt discountApplication');
      
      console.log('  Found:', purchases.length);
      purchases.forEach((p: any) => {
        console.log('    -', p.user?.fullname, '- Amount:', p.finalAmount, '- Date:', p.createdAt.toISOString().split('T')[0]);
      });
      
      // Also check ALL purchases for this org regardless of status
      console.log('\n📦 All Purchases (any status):');
      const allPurchases = await Purchase.find({
        'discountApplication.organizationId': org._id,
        createdAt: { $gte: new Date('2026-01-01'), $lte: new Date('2026-01-31') }
      }).populate('user', 'fullname').select('_id finalAmount user status createdAt');
      
      console.log('  Found:', allPurchases.length);
      allPurchases.forEach((p: any) => {
        console.log('    -', p.user?.fullname, '- Amount:', p.finalAmount, '- Status:', p.status, '- Date:', p.createdAt.toISOString().split('T')[0]);
      });
      
    } else {
      console.log('❌ Organization not found with email prayashahi@gmail.com');
      
      // List all organizations
      console.log('\n📋 All verified organizations:');
      const allOrgs = await Organization.find({ status: 'verified' });
      allOrgs.forEach((o: any) => {
        console.log('- ', o.name, '(', o.contactPerson.email, ')');
      });
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkData();
