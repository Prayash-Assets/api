import { FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import Purchase from "../models/Purchase";
import User from "../models/User";
import Commission from "../models/Commission";
import Organization from "../models/Organization";
import OrganizationMember from "../models/OrganizationMember";
import DiscountApplication from "../models/DiscountApplication";

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

    const wasAlreadyCaptured = purchase.status === "captured";

    if (!wasAlreadyCaptured) {
      purchase.status = "captured";
      await purchase.save();
      
      // Add package to user if not already added
      await addPackageToStudent(
        (purchase.user as any).toString(), 
        (purchase.package as any)._id.toString()
      );
      
      console.log("✅ Payment captured via webhook:", payment.id);
    } else {
      console.log("ℹ️ Payment already captured (via verify endpoint):", payment.id);
    }

    // Always update commission records, even if already captured
    // (In case verify endpoint ran before webhook)
    await updateCommissionForPurchase(purchase);
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

// Helper function to update commission records when a purchase is made
export const updateCommissionForPurchase = async (purchase: any) => {
  try {
    console.log(`\n=== [COMMISSION] Starting commission processing ===`);
    console.log(`💰 Purchase ID: ${purchase._id}`);
    console.log(`💰 User ID: ${purchase.user}`);
    console.log(`💰 Amount: ₹${purchase.amount}`);
    
    // Check if user belongs to an organization
    const orgMember = await OrganizationMember.findOne({
      user: purchase.user,
      status: { $in: ['active', 'registered'] }
    }).populate('organization');
    
    if (!orgMember) {
      console.log(`❌ [COMMISSION] User is NOT a member of any organization`);
      return;
    }
    
    if (!orgMember.organization) {
      console.log(`❌ [COMMISSION] Organization reference is null/undefined`);
      return;
    }
    
    const org = orgMember.organization as any;
    console.log(`✅ [COMMISSION] Organization: ${org.name} (${org._id})`);
    console.log(`💵 [COMMISSION] Commission Rate: ${org.commissionRate}%`);
    
    // Check if this purchase already has a commission record
    console.log(`🔍 [COMMISSION] Checking for existing commission...`);
    const existingCommissionForPurchase = await Commission.findOne({
      'purchases.purchase': purchase._id
    });
    
    if (existingCommissionForPurchase) {
      console.log(`⚠️ [COMMISSION] Purchase ALREADY has commission: ${existingCommissionForPurchase._id}`);
      console.log(`   Status: ${existingCommissionForPurchase.status}`);
      return;
    }
    
    // Get the discount application to find final price
    const discountApp = await DiscountApplication.findOne({
      purchase: purchase._id
    });
    
    const finalPrice = discountApp?.finalPrice || purchase.amount;
    const commissionAmount = (finalPrice * org.commissionRate) / 100;
    
    console.log(`💵 [COMMISSION] Final Price: ₹${finalPrice}, Commission: ₹${commissionAmount}`);
    
    // Get package details if available
    const populatedPurchase = await Purchase.findById(purchase._id).populate('package');
    const packageName = (populatedPurchase?.package as any)?.name || 'Package';
    
    // Determine the commission period for this purchase (monthly)
    const purchaseDate = new Date(purchase.createdAt);
    const periodStartDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1);
    const periodEndDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log(`📅 [COMMISSION] Period Start: ${periodStartDate.toISOString()}`);
    console.log(`📅 [COMMISSION] Period End: ${periodEndDate.toISOString()}`);
    
    // BUSINESS RULE: Check for existing UNPAID commission for THIS SPECIFIC PERIOD
    // This ensures we never modify paid commissions and keep periods separate
    console.log(`🔍 [COMMISSION] Searching for unpaid commission in this period...`);
    const unpaidCommission = await Commission.findOne({
      organization: org._id,
      'period.startDate': { $lte: periodStartDate },
      'period.endDate': { $gte: periodEndDate },
      status: { $in: ['pending', 'processed'] } // Not paid yet
    });
    
    if (unpaidCommission) {
      // MERGE: Add this purchase to the existing unpaid commission FOR THIS PERIOD
      console.log(`\n📦 [COMMISSION] MERGING into existing unpaid commission`);
      console.log(`   Commission ID: ${unpaidCommission._id}`);
      console.log(`   Status: ${unpaidCommission.status}`);
      console.log(`   Current Total: ₹${unpaidCommission.finalAmount}`);
      console.log(`   Period: ${unpaidCommission.period.startDate} to ${unpaidCommission.period.endDate}`);
      
      // Add purchase to the purchases array
      unpaidCommission.purchases = unpaidCommission.purchases || [];
      (unpaidCommission.purchases as any).push({
        purchase: purchase._id,
        user: purchase.user,
        studentName: orgMember.name,
        packageName: packageName,
        amount: finalPrice,
        commission: commissionAmount,
        purchaseDate: purchase.createdAt,
      });
      
      // Add payout to the payouts array
      unpaidCommission.payouts = unpaidCommission.payouts || [];
      (unpaidCommission.payouts as any).push({
        purchaseId: purchase._id,
        amount: commissionAmount,
        status: 'pending',
        transactionId: null,
        paidAt: null,
        paymentMethod: null,
        notes: null,
        createdAt: purchase.createdAt,
      });
      
      // Update totals
      unpaidCommission.totalSales = (unpaidCommission.totalSales || 0) + finalPrice;
      unpaidCommission.purchaseCount = (unpaidCommission.purchaseCount || 0) + 1;
      unpaidCommission.baseCommission = (unpaidCommission.baseCommission || 0) + commissionAmount;
      unpaidCommission.totalCommission = unpaidCommission.baseCommission + (unpaidCommission.bonusCommission || 0);
      unpaidCommission.finalAmount = Math.max(unpaidCommission.totalCommission, unpaidCommission.minimumGuarantee || 0);
      
      // Keep status as-is (pending or processed, but not paid)
      await unpaidCommission.save();
      
      console.log(`✅ [COMMISSION] Merged successfully!`);
      console.log(`   Commission ID: ${unpaidCommission._id}`);
      console.log(`   New Total Sales: ₹${unpaidCommission.totalSales}`);
      console.log(`   New Total Commission: ₹${unpaidCommission.finalAmount}`);
      console.log(`   Total Purchases: ${unpaidCommission.purchaseCount}`);
      console.log(`=== [COMMISSION] Merge complete ===\n`);
      
    } else {
      // CREATE NEW: No unpaid commission exists for this period, create a new one
      console.log(`\n📝 [COMMISSION] NO unpaid commission found - CREATING NEW RECORD`);
      console.log(`   Period: ${periodStartDate.toISOString()} to ${periodEndDate.toISOString()}`);
      
      const startDate = periodStartDate;
      const endDate = periodEndDate;
      
      try {
        const newCommission = new Commission({
          organization: org._id,
          period: {
            startDate,
            endDate,
            type: 'monthly',
          },
          purchases: [{
            purchase: purchase._id,
            user: purchase.user,
            studentName: orgMember.name,
            packageName: packageName,
            amount: finalPrice,
            commission: commissionAmount,
            purchaseDate: purchase.createdAt,
          }],
          payouts: [{
            purchaseId: purchase._id,
            amount: commissionAmount,
            status: 'pending',
            transactionId: null,
            paidAt: null,
            paymentMethod: null,
            notes: null,
            createdAt: purchase.createdAt,
          }],
          totalSales: finalPrice,
          purchaseCount: 1,
          commissionRate: org.commissionRate,
          baseCommission: commissionAmount,
          bonusCommission: 0,
          totalCommission: commissionAmount,
          minimumGuarantee: 0,
          finalAmount: commissionAmount,
          status: 'pending',
          paymentDetails: {
            transactionId: null,
            paidAt: null,
            paymentMethod: null,
            notes: null,
          },
          calculatedAt: new Date(),
          calculatedBy: null,
        });
        
        await newCommission.save();
        
        console.log(`✅ [COMMISSION] NEW commission created successfully!`);
        console.log(`   Commission ID: ${newCommission._id}`);
        console.log(`   Organization: ${org.name}`);
        console.log(`   Purchase: ${purchase._id}`);
        console.log(`   Amount: ₹${finalPrice}`);
        console.log(`   Commission: ₹${commissionAmount}`);
        console.log(`   Status: pending`);
        console.log(`=== [COMMISSION] Creation complete ===\n`);
        
      } catch (insertError: any) {
        // Handle duplicate key error - unique index conflict
        if (insertError.code === 11000) {
          console.log(`\n⚠️ [COMMISSION] Duplicate key error - Trying to find UNPAID commission to merge...`);
          
          // Only merge into UNPAID commissions (pending or processed)
          // Paid commissions should NOT be merged with - create separate record instead
          const existingUnpaidCommission = await Commission.findOne({
            organization: org._id,
            'period.type': 'monthly',
            'period.startDate': { $gte: new Date(periodStartDate.getTime() - 86400000), $lte: new Date(periodStartDate.getTime() + 86400000) },
            status: { $in: ['pending', 'processed'] }  // ONLY unpaid
          });
          
          if (existingUnpaidCommission) {
            console.log(`✅ [COMMISSION] Found UNPAID commission to merge: ${existingUnpaidCommission._id}`);
            console.log(`   Current Status: ${existingUnpaidCommission.status}`);
            
            // Check if purchase already in this commission
            const purchaseExists = existingUnpaidCommission.purchases.some(p => p.purchase.toString() === purchase._id.toString());
            if (!purchaseExists) {
              existingUnpaidCommission.purchases.push({
                purchase: purchase._id,
                user: purchase.user,
                studentName: orgMember.name,
                packageName: packageName,
                amount: finalPrice,
                commission: commissionAmount,
                purchaseDate: purchase.createdAt,
              } as any);
              
              existingUnpaidCommission.payouts = existingUnpaidCommission.payouts || [];
              (existingUnpaidCommission.payouts as any).push({
                purchaseId: purchase._id,
                amount: commissionAmount,
                status: 'pending',
                transactionId: null,
                paidAt: null,
                paymentMethod: null,
                notes: null,
                createdAt: purchase.createdAt,
              });
              
              existingUnpaidCommission.totalSales = (existingUnpaidCommission.totalSales || 0) + finalPrice;
              existingUnpaidCommission.purchaseCount = (existingUnpaidCommission.purchaseCount || 0) + 1;
              existingUnpaidCommission.baseCommission = (existingUnpaidCommission.baseCommission || 0) + commissionAmount;
              existingUnpaidCommission.totalCommission = existingUnpaidCommission.baseCommission + (existingUnpaidCommission.bonusCommission || 0);
              existingUnpaidCommission.finalAmount = Math.max(existingUnpaidCommission.totalCommission, existingUnpaidCommission.minimumGuarantee || 0);
              
              await existingUnpaidCommission.save();
              
              console.log(`✅ [COMMISSION] Merged into UNPAID commission!`);
              console.log(`   Commission ID: ${existingUnpaidCommission._id}`);
              console.log(`   New Total: ₹${existingUnpaidCommission.finalAmount}`);
              console.log(`   Total Purchases: ${existingUnpaidCommission.purchaseCount}`);
              console.log(`=== [COMMISSION] Merge complete ===\n`);
            } else {
              console.log(`ℹ️ [COMMISSION] Purchase already exists in this commission`);
            }
          } else {
            // No unpaid commission found - this means a PAID commission exists
            // Don't merge with paid ones! This requires removing the unique index in MongoDB
            console.log(`⚠️ [COMMISSION] No UNPAID commission found (paid commission exists)`);
            console.log(`ℹ️ [COMMISSION] Cannot create new commission - unique index prevents duplicates for same period`);
            console.log(`📌 [COMMISSION] ACTION REQUIRED: Remove unique index from MongoDB to allow separate per-period commissions`);
            console.log(`   Index to drop: organization_1_period.startDate_1_period.endDate_1_period.type_1`);
            console.log(`=== [COMMISSION] Skipped - Index conflict ===\n`);
          }
        } else {
          throw insertError;
        }
      }
    }
    
  } catch (error: any) {
    console.error("\n❌ [COMMISSION] ERROR processing commission:", error);
    console.error(`❌ [COMMISSION] Error message:`, error.message);
    console.error(`❌ [COMMISSION] Error stack:`, error.stack);
    console.error(`=== [COMMISSION] Failed ===\n`);
    console.error("❌ Error stack:", error.stack);
    
    // Don't throw - we don't want to fail the webhook if commission processing fails
  }
};
