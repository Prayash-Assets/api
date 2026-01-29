import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Commission from './src/models/Commission';
import Organization from './src/models/Organization'; // Import Organization model

async function listCommissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    const count = await Commission.countDocuments({});
    const all = await Commission.find({})
      .populate('organization')
      .sort({ createdAt: -1 });
    
    console.log('\n📊 Total commissions:', count);
    console.log('\n📋 All commission records:\n');
    
    all.forEach((c, i) => {
      const org = c.organization as any;
      console.log(`${i + 1}. Commission ID: ${c._id}`);
      console.log(`   Organization: ${org?.name || 'Unknown'}`);
      console.log(`   Status: ${c.status}`);
      console.log(`   Amount: ₹${c.finalAmount}`);
      console.log(`   Period: ${c.period.type} (${new Date(c.period.startDate).toLocaleDateString()} - ${new Date(c.period.endDate).toLocaleDateString()})`);
      console.log(`   Created: ${c.createdAt?.toISOString()}`);
      console.log('');
    });
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

listCommissions();
