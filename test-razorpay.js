const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function testRazorpayConnection() {
  try {
    console.log('Testing Razorpay connection...');
    console.log('Key ID:', process.env.RAZORPAY_KEY_ID);
    console.log('Key Secret:', process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing');

    // Test 1: Create a test order
    const orderOptions = {
      amount: 100, // ₹1.00 in paise
      currency: 'INR',
      receipt: 'test_receipt_' + Date.now(),
      notes: {
        test: 'true'
      }
    };

    console.log('\n1. Creating test order...');
    const order = await razorpay.orders.create(orderOptions);
    console.log('✅ Order created successfully:', {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status
    });

    // Test 2: Fetch the created order
    console.log('\n2. Fetching order details...');
    const fetchedOrder = await razorpay.orders.fetch(order.id);
    console.log('✅ Order fetched successfully:', {
      id: fetchedOrder.id,
      status: fetchedOrder.status,
      amount: fetchedOrder.amount
    });

    // Test 3: List recent orders
    console.log('\n3. Listing recent orders...');
    const orders = await razorpay.orders.all({ count: 5 });
    console.log('✅ Orders listed successfully. Count:', orders.items.length);

    console.log('\n🎉 All tests passed! Razorpay integration is working correctly.');
    
  } catch (error) {
    console.error('❌ Razorpay test failed:', error.message);
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode);
    }
    if (error.error) {
      console.error('Error Details:', error.error);
    }
  }
}

testRazorpayConnection();
