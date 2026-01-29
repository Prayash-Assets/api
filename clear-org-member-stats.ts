import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';

async function clearOrgMemberStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🧹 Clearing Organization Member Statistics\n');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    
    const members = await OrganizationMember.find({
      organization: org._id
    });
    
    console.log('\n👥 Members:', members.length);
    members.forEach(m => {
      console.log(`   - ${m.name}: totalSpent=₹${m.totalSpent}, totalPurchases=${m.totalPurchases}`);
    });
    
    // Reset all member stats
    const result = await OrganizationMember.updateMany(
      { organization: org._id },
      {
        $set: {
          totalSpent: 0,
          totalPurchases: 0,
          lastPurchaseAt: null
        }
      }
    );
    
    console.log('\n✅ Reset complete!');
    console.log('   Modified:', result.modifiedCount, 'members');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

clearOrgMemberStats();
