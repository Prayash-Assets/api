import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import Purchase from './src/models/Purchase';

async function checkPurchases() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    const members = await OrganizationMember.find({
      organization: org._id,
      status: { $in: ['active', 'registered'] }
    });
    
    console.log('\n👥 Members:', members.length);
    members.forEach(m => {
      console.log(`   - ${m.name} (${m.email}) - User ID: ${m.user}`);
    });
    
    const memberUserIds = members.map(m => m.user);
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log('\n📅 Period:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const purchases = await Purchase.find({
      user: { $in: memberUserIds },
      status: 'captured',
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });
    
    console.log('\n📦 Purchases Found:', purchases.length);
    purchases.forEach((p, i) => {
      console.log(`   ${i + 1}. ID: ${p._id}`);
      console.log(`      User: ${p.user}`);
      console.log(`      Amount: ${p.amount}`);
      console.log(`      Status: ${p.status}`);
      console.log(`      Created: ${p.createdAt}`);
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkPurchases();
