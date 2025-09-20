import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import Purchase from "../models/Purchase";
import User from "../models/User";

export const handleRazorpayWebhook = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("Webhook secret not configured");
      return reply.status(500).send({ message: "Webhook not configured" });
    }

    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'] as string;
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error("Invalid webhook signature");
      return reply.status(400).send({ message: "Invalid signature" });
    }

    const event = req.body as any;
    console.log("Received webhook event:", event.event, event.payload?.payment?.entity?.id);

    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      case 'payment.authorized':
        await handlePaymentAuthorized(event.payload.payment.entity);
        break;
      default:
        console.log("Unhandled webhook event:", event.event);
    }

    reply.status(200).send({ status: 'ok' });
  } catch (error) {
    console.error("Webhook processing error:", error);
    reply.status(500).send({ message: "Webhook processing failed" });
  }
};

const handlePaymentCaptured = async (payment: any) => {
  try {
    console.log("Processing payment.captured webhook:", payment.id);
    
    const purchase = await Purchase.findOne({ 
      razorpayPaymentId: payment.id 
    }).populate("package");

    if (!purchase) {
      console.error("Purchase not found for payment:", payment.id);
      return;
    }

    if (purchase.status !== "captured") {
      purchase.status = "captured";
      await purchase.save();
      
      // Add package to user if not already added
      await addPackageToStudent(
        (purchase.user as any).toString(), 
        (purchase.package as any)._id.toString()
      );
      
      console.log("✅ Payment captured via webhook:", payment.id);
    }
  } catch (error) {
    console.error("Error handling payment.captured webhook:", error);
  }
};

const handlePaymentFailed = async (payment: any) => {
  try {
    console.log("Processing payment.failed webhook:", payment.id);
    
    const purchase = await Purchase.findOne({ 
      razorpayPaymentId: payment.id 
    });

    if (purchase && purchase.status !== "failed") {
      purchase.status = "failed";
      purchase.failureReason = payment.error_description || "Payment failed";
      await purchase.save();
      
      console.log("❌ Payment failed via webhook:", payment.id);
    }
  } catch (error) {
    console.error("Error handling payment.failed webhook:", error);
  }
};

const handlePaymentAuthorized = async (payment: any) => {
  try {
    console.log("Processing payment.authorized webhook:", payment.id);
    
    const purchase = await Purchase.findOne({ 
      razorpayPaymentId: payment.id 
    });

    if (purchase && purchase.status === "created") {
      purchase.status = "authorized";
      await purchase.save();
      
      console.log("⚠️ Payment authorized via webhook:", payment.id);
    }
  } catch (error) {
    console.error("Error handling payment.authorized webhook:", error);
  }
};

// Helper function to add package to student (same as in purchaseController)
const addPackageToStudent = async (userId: string, packageId: string) => {
  try {
    console.log(`🔍 Adding package ${packageId} to user ${userId}`);
    
    // First check if user exists and get their type
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      throw new Error("User not found");
    }

    console.log(`✅ User found: ${user.email}, type: ${user.userType}`);

    // Only students can have packages
    if (user.userType !== 'Student') {
      console.log(`⚠️ User ${user.email} is not a student, cannot add packages`);
      return;
    }

    // Use MongoDB update operation to add package (handles duplicates automatically)
    const updateResult = await User.updateOne(
      { _id: userId },
      { $addToSet: { packages: packageId } }
    );
    
    console.log(`📝 Update result:`, updateResult);
    
    if (updateResult.modifiedCount > 0) {
      console.log(`✅ Package ${packageId} added to student ${userId}`);
    } else {
      console.log(`ℹ️ Package ${packageId} already exists for student ${userId}`);
    }
  } catch (error) {
    console.error("❌ Error adding package to student:", error);
    throw error;
  }
};
