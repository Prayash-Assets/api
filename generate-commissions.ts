/**
 * Commission Generation Script (TypeScript)
 * 
 * Generates commission records for organizations based on completed purchases
 * Usage: npx ts-node generate-commissions.ts --period monthly
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import Commission from './src/models/Commission';
import Organization from './src/models/Organization';
import Purchase from './src/models/Purchase';

// Parse command line arguments
const args = process.argv.slice(2);
const getPeriodType = () => {
  const periodIndex = args.indexOf('--period');
  return periodIndex >= 0 ? args[periodIndex + 1] : 'monthly';
};

const getMonth = () => {
  const monthIndex = args.indexOf('--month');
  return monthIndex >= 0 ? args[monthIndex + 1] : null;
};

/**
 * Calculate date range based on period type
 */
function getDateRange(periodType: string, monthStr: string | null) {
  const now = new Date();
  let startDate, endDate;

  if (monthStr) {
    // Parse month string (e.g., "2025-01")
    const [year, month] = monthStr.split('-').map(Number);
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59, 999);
  } else {
    // Use previous period
    switch (periodType) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      case 'weekly':
        const lastWeekStart = new Date(now);
        lastWeekStart.setDate(now.getDate() - 7);
        startDate = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      case 'monthly':
      default:
        // Previous month
        const lastMonth = now.getMonth() - 1;
        const year = lastMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const month = lastMonth < 0 ? 11 : lastMonth;
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        break;
    }
  }

  return { startDate, endDate };
}

/**
 * Generate commission for a single organization
 */
async function generateCommissionForOrg(
  org: any,
  startDate: Date,
  endDate: Date,
  periodType: string
) {
  console.log(`\n📊 Processing: ${org.name}`);
  console.log(`   Commission Rate: ${org.commissionRate}%`);

  // Check if commission already exists for this period
  const existingCommission = await Commission.findOne({
    organization: org._id,
    'period.startDate': startDate,
    'period.endDate': endDate,
    'period.type': periodType,
  });

  if (existingCommission) {
    console.log(`   ⚠️  Commission already exists (Status: ${existingCommission.status})`);
    return null;
  }

  // Find all purchases from this organization's students in the period
  const purchases = await Purchase.find({
    status: 'captured', // Only completed purchases
    createdAt: { $gte: startDate, $lte: endDate },
    'discountApplication.organizationId': org._id,
  })
    .populate('user', 'fullname email')
    .populate('package', 'name')
    .sort({ createdAt: 1 });

  if (purchases.length === 0) {
    console.log(`   ℹ️  No purchases found in this period`);
    return null;
  }

  console.log(`   ✅ Found ${purchases.length} purchases`);

  // Calculate totals
  const totalSales = purchases.reduce((sum, p: any) => sum + p.finalAmount, 0);
  const baseCommission = totalSales * (org.commissionRate / 100);

  // Prepare purchase details
  const purchaseDetails = purchases.map((p: any) => ({
    purchase: p._id,
    user: p.user._id,
    studentName: p.user.fullname,
    packageName: p.package.name,
    amount: p.finalAmount,
    commission: p.finalAmount * (org.commissionRate / 100),
    purchaseDate: p.createdAt,
  }));

  // Create commission record
  const commission = await Commission.create({
    organization: org._id,
    period: {
      startDate,
      endDate,
      type: periodType,
    },
    purchases: purchaseDetails,
    totalSales,
    purchaseCount: purchases.length,
    commissionRate: org.commissionRate,
    baseCommission,
    bonusCommission: 0, // Can be calculated based on volume tiers
    totalCommission: baseCommission,
    minimumGuarantee: 0, // Set if applicable
    finalAmount: baseCommission,
    status: 'pending',
    calculatedAt: new Date(),
    calculatedBy: null, // System-generated
  });

  console.log(`   💰 Commission: ₹${baseCommission.toFixed(2)}`);
  console.log(`   📦 Total Sales: ₹${totalSales.toFixed(2)}`);

  return commission;
}

/**
 * Main function
 */
async function generateCommissions() {
  const periodType = getPeriodType();
  const monthStr = getMonth();
  const { startDate, endDate } = getDateRange(periodType, monthStr);

  console.log('\n🚀 Commission Generation Script');
  console.log('================================');
  console.log(`Period Type: ${periodType}`);
  console.log(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log('================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB\n');

    // Find all verified organizations with commission rates
    const organizations = await Organization.find({
      status: 'verified',
      commissionRate: { $exists: true, $gt: 0 },
    }).select('name type commissionRate');

    console.log(`Found ${organizations.length} organizations with commission rates\n`);

    if (organizations.length === 0) {
      console.log('⚠️  No organizations found. Set commission rates in admin panel.');
      await mongoose.disconnect();
      return;
    }

    // Generate commissions for each organization
    const results = [];
    for (const org of organizations) {
      const commission = await generateCommissionForOrg(org, startDate, endDate, periodType);
      if (commission) {
        results.push(commission);
      }
    }

    console.log('\n================================');
    console.log('📊 Summary');
    console.log('================================');
    console.log(`Organizations Processed: ${organizations.length}`);
    console.log(`Commissions Generated: ${results.length}`);
    console.log(`Total Commission Amount: ₹${results.reduce((sum, c) => sum + c.finalAmount, 0).toFixed(2)}`);
    console.log('================================\n');

    console.log('✅ Commission generation completed!');
    console.log('💡 View commissions in admin panel: /discounts/commissions\n');

  } catch (error) {
    console.error('❌ Error generating commissions:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  generateCommissions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateCommissions };
