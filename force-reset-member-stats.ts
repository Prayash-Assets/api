import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import OrganizationMember from './src/models/OrganizationMember';

async function forceResetMemberStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔨 FORCE RESETTING ALL OrganizationMember Stats\n');
    
    // Reset ALL organization members
    const result = await OrganizationMember.updateMany(
      {}, 
      {
        $set: {
          totalSpent: 0,
          totalPurchases: 0,
          lastPurchaseDate: null,
          lastPurchaseAt: null
        }
      }
    );
    
    console.log('✅ Reset complete!');
    console.log('   Updated documents:', result.modifiedCount);
    console.log('   Matched documents:', result.matchedCount);
    
    // Verify
    console.log('\n📋 Verification:');
    const members = await OrganizationMember.find();
    members.forEach((m: any) => {
      console.log(`   Member: ${m.name}`);
      console.log(`      totalSpent: ${m.totalSpent}`);
      console.log(`      totalPurchases: ${m.totalPurchases}`);
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

forceResetMemberStats();
