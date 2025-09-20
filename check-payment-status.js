const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function checkPaymentStatus(paymentId) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    console.log('Payment Status:', {
      id: payment.id,
      status: payment.status,
      captured: payment.captured,
      amount: payment.amount / 100, // Convert paise to rupees
      method: payment.method,
      created_at: new Date(payment.created_at * 1000).toLocaleString()
    });
    
    if (payment.status === 'authorized' && !payment.captured) {
      console.log('\n⚠️  Payment is authorized but NOT captured - money not collected');
      console.log('💡 Use manual capture endpoint: POST /api/purchases/{id}/capture');
    } else if (payment.captured || payment.status === 'captured') {
      console.log('\n✅ Payment is captured - money collected successfully');
    }
    
  } catch (error) {
    console.error('Error fetching payment:', error.message);
  }
}

// Usage: node check-payment-status.js pay_XXXXXXXXXX
const paymentId = process.argv[2];
if (!paymentId) {
  console.log('Usage: node check-payment-status.js <payment_id>');
  console.log('Example: node check-payment-status.js pay_29QQoUBi66xm2f');
} else {
  checkPaymentStatus(paymentId);
}
