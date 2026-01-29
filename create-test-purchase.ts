import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Purchase from './src/models/Purchase';
import Package from './src/models/Package';
import Organization from './src/models/Organization';
import OrganizationMember from './src/models/OrganizationMember';
import { updateCommissionForPurchase } from './src/controllers/webhookController';

/**
 * Create a test purchase and generate commission
 */
async function createTestPurchase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    
    console.log('\n🧪 Creating Test Purchase\n');
    
    // Get organization
    const org = await Organization.findOne({ 'contactPerson.email': 'prayashahi@gmail.com' });
    
    if (!org) {
      console.log('❌ Organization not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📊 Organization:', org.name);
    
    // Get a member
    const member = await OrganizationMember.findOne({
      organization: org._id,
      status: { $in: ['active', 'registered'] }
    });
    
    if (!member) {
      console.log('❌ No members found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👤 Member:', member.name, '(' + member.email + ')');
    console.log('   User ID:', member.user);
    
    // Get a package
    const pkg = await Package.findOne({ published: true });
    
    if (!pkg) {
      console.log('❌ No published packages found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('📦 Package:', pkg.name);
    console.log('   Price: ₹' + pkg.price);
    
    // Create test purchase
    const testPurchase = new Purchase({
      user: member.user,
      package: pkg._id,
      amount: pkg.price,
      status: 'captured',
      razorpayOrderId: 'test_order_' + Date.now(),
      razorpayPaymentId: 'test_payment_' + Date.now(),
      razorpaySignature: 'test_signature',
      orderDetails: {
        customerName: member.name,
        customerEmail: member.email,
        customerPhone: '0000000000',
        packageName: pkg.name
      }
    });
    
    await testPurchase.save();
    
    console.log('\n✅ Test purchase created!');
    console.log('   Purchase ID:', testPurchase._id);
    console.log('   Amount: ₹' + testPurchase.amount);
    console.log('   Status:', testPurchase.status);
    
    // Trigger commission generation
    console.log('\n💰 Generating commission...');
    await updateCommissionForPurchase(testPurchase);
    
    console.log('\n✅ Test completed\n');
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

createTestPurchase();
