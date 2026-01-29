import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from './src/models/User';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';

async function addUserToOrganization() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🔧 Adding User to Organization\n');
    
    // Get the user
    const userId = '69799afa226c2de7603982ca';
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('❌ User not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👤 User:', user.fullname);
    console.log('   Email:', user.email);
    console.log('   Type:', user.userType);
    
    // Get the organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n🏢 Organization:', org.name);
    console.log('   Commission Rate:', org.commissionRate + '%');
    
    // Check if already a member
    const existing = await OrganizationMember.findOne({
      user: userId,
      organization: org._id
    });
    
    if (existing) {
      console.log('\n✅ User is already a member');
      console.log('   Status:', existing.status);
      
      if (existing.status !== 'active' && existing.status !== 'registered') {
        console.log('   Updating status to "active"...');
        existing.status = 'active';
        await existing.save();
        console.log('   ✅ Status updated to active');
      }
    } else {
      console.log('\n📝 Creating organization member...');
      
      const member = new OrganizationMember({
        organization: org._id,
        user: userId,
        name: user.fullname,
        email: user.email,
        status: 'active',
        joinedAt: new Date(),
        totalSpent: 0,
        totalPurchases: 0
      });
      
      await member.save();
      console.log('   ✅ Member created successfully');
      console.log('   Member ID:', member._id);
    }
    
    // Verify membership
    const finalMember = await OrganizationMember.findOne({
      user: userId,
      organization: org._id
    });
    
    console.log('\n📊 Final Member Status:');
    console.log('   Organization:', org.name);
    console.log('   User:', user.fullname);
    console.log('   Status:', finalMember?.status);
    console.log('   Member ID:', finalMember?._id);
    
    console.log('\n✅ User is now a member of the organization');
    console.log('   Future purchases will generate commissions automatically');
    console.log('\n💡 To generate commission for the existing purchase, run:');
    console.log('   npx ts-node diagnose-real-purchase.ts');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

addUserToOrganization();
