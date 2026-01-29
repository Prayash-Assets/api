import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';

async function migrateToPayouts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🚀 Migrating Commissions to Payouts Structure\n');
    
    // Get all commissions with purchases
    const commissions = await Commission.find({
      purchases: { $ne: [] }
    });
    
    console.log(`📋 Found ${commissions.length} commission record(s) to migrate\n`);
    
    for (const commission of commissions) {
      console.log(`\n📝 Processing Commission: ${commission._id}`);
      console.log(`   Organization: ${commission.organization}`);
      console.log(`   Purchases: ${commission.purchases.length}`);
      
      // Check if payouts already exist
      if (commission.payouts && commission.payouts.length > 0) {
        console.log(`   ⚠️  Already has payouts array. Skipping.`);
        continue;
      }
      
      // Create payouts from purchases
      const payouts: any[] = [];
      
      for (let i = 0; i < commission.purchases.length; i++) {
        const purchase = commission.purchases[i];
        
        // Determine if this payout was paid based on the commission status and order
        let payoutStatus = 'pending';
        let paidAt = null;
        let transactionId = null;
        let paymentMethod = null;
        
        // If commission is marked as paid, the first purchase is paid
        // If it has more purchases and it's paid, only the first is definitely paid
        if (commission.status === 'paid' && i === 0) {
          payoutStatus = 'paid';
          paidAt = commission.paymentDetails?.paidAt || commission.processedAt || new Date();
          transactionId = commission.paymentDetails?.transactionId || null;
          paymentMethod = commission.paymentDetails?.paymentMethod || null;
        } else if (commission.status === 'processed' && i === 0) {
          payoutStatus = 'paid';
          paidAt = commission.paymentDetails?.paidAt || commission.processedAt || new Date();
          transactionId = commission.paymentDetails?.transactionId || null;
          paymentMethod = commission.paymentDetails?.paymentMethod || null;
        }
        
        payouts.push({
          purchaseId: purchase.purchase,
          amount: purchase.commission,
          status: payoutStatus,
          transactionId,
          paidAt,
          paymentMethod,
          notes: null,
          createdAt: purchase.purchaseDate || new Date(),
        });
        
        console.log(`   ✓ Payout ${i + 1}: ₹${purchase.commission} - ${payoutStatus}`);
      }
      
      // Update commission with payouts
      commission.payouts = payouts;
      await commission.save();
      
      console.log(`   ✅ Updated commission with ${payouts.length} payout(s)`);
    }
    
    console.log('\n✅ Migration complete!\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

migrateToPayouts();
