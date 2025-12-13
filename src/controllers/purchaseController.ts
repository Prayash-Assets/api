import { FastifyRequest, FastifyReply } from "fastify";
import Purchase, { IPurchase } from "../models/Purchase";
import Package from "../models/Package";
import User from "../models/User";
import Razorpay from "razorpay";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";
import PDFDocument from "pdfkit";
import path from "path";
import emailService from "../utils/emailService";

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export interface CreateOrderBody {
  packageId: string;
}

export interface VerifyPaymentBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  purchaseId: string;
}

export interface GetOrDeletePurchaseParams {
  id: string;
}

export const createOrder = async (
  req: FastifyRequest<{ Body: CreateOrderBody }>,
  reply: FastifyReply
) => {
  try {
    const { packageId } = req.body;
    const userId = (req as any).user.id;

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return reply.status(500).send({
        message: "Payment gateway not configured. Please contact support.",
        error: "PAYMENT_GATEWAY_NOT_CONFIGURED"
      });
    }

    // Validate package exists and is available for purchase
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return reply.status(404).send({ message: "Package not found" });
    }

    if (!pkg.published || !pkg.publicView) {
      return reply
        .status(400)
        .send({ message: "Package not available for purchase" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return reply.status(404).send({ message: "User not found" });
    }

    // Check if user already purchased this package successfully
    const existingSuccessfulPurchase = await Purchase.findOne({
      user: userId,
      package: packageId,
      status: { $in: ["captured", "authorized"] },
    });

    if (existingSuccessfulPurchase) {
      return reply.status(400).send({ message: "Package already purchased" });
    }

    // DUPLICATE ORDER PREVENTION: Check for existing pending orders
    const existingPendingOrders = await Purchase.find({
      user: userId,
      package: packageId,
      status: "created",
    });

    // Cancel all existing pending orders for this user-package combination
    if (existingPendingOrders.length > 0) {
      console.log(
        `Found ${existingPendingOrders.length} pending orders for user ${userId}, package ${packageId}. Cancelling them...`
      );

      await Purchase.updateMany(
        {
          user: userId,
          package: packageId,
          status: "created",
        },
        {
          status: "cancelled",
          failureReason: "Cancelled automatically due to new payment attempt",
          updatedAt: new Date(),
        }
      );

      console.log(
        `Cancelled ${existingPendingOrders.length} pending orders for user ${userId}, package ${packageId}`
      );
    }

    // Generate unique receipt number
    const receiptNumber = `RCP_${Date.now()}_${userId.slice(-4)}`;

    const options = {
      amount: pkg.getDisplayPrice() * 100, // Use discounted price if available, amount in paise (currency subunits)
      currency: "INR",
      receipt: receiptNumber,
      notes: {
        package_id: packageId,
        user_id: userId,
        original_price: pkg.originalPrice || pkg.price,
        discount_percentage: pkg.discountPercentage || 0,
        final_price: pkg.getDisplayPrice(),
      },
    };

    // Create order using Razorpay SDK
    const order = await razorpay.orders.create(options);

    // Create comprehensive purchase record
    const newPurchase = new Purchase({
      user: userId,
      package: packageId,
      razorpayOrderId: order.id,
      razorpayPaymentId: null,
      amount: pkg.getDisplayPrice(), // Store the same price sent to Razorpay
      currency: order.currency,
      status: "created",
      orderDetails: {
        packageName: pkg.name,
        packageDescription: pkg.description,
        customerEmail: user.email,
        customerName: user.fullname,
        customerPhone: user.phone?.toString(),
      },
    });

    await newPurchase.save();

    console.log("Razorpay order created successfully:", {
      orderId: order.id,
      packageName: pkg.name,
      amount: pkg.getDisplayPrice(), // Show the actual amount charged
      currency: order.currency,
      customerEmail: user.email,
      cancelledPreviousOrders: existingPendingOrders.length,
    });

    const responseData = {
      orderId: order.id,
      currency: order.currency,
      amount: order.amount,
      purchaseId: newPurchase._id,
      key: process.env.RAZORPAY_KEY_ID,
      packageDetails: {
        name: pkg.name,
        description: pkg.description,
        price: pkg.getDisplayPrice(), // Return the actual price charged
      },
      customerDetails: {
        name: user.fullname,
        email: user.email,
        phone: user.phone,
      },
      previousOrdersCancelled: existingPendingOrders.length,
    };

    console.log("🔍 Sending response to frontend:", {
      orderId: responseData.orderId,
      key: responseData.key,
      keyPresent: !!responseData.key
    });

    reply.status(201).send(responseData);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    reply.status(500).send({ message: "Failed to create order", error });
  }
};

export const verifyPayment = async (
  req: FastifyRequest<{ Body: VerifyPaymentBody }>,
  reply: FastifyReply
) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      purchaseId,
    } = req.body;

    // Get userId from purchase record instead of auth middleware
    let purchase = await Purchase.findById(purchaseId);

    // Fallback: try to find by razorpay_order_id if purchaseId lookup fails
    if (!purchase) {
      purchase = await Purchase.findOne({ razorpayOrderId: razorpay_order_id });
    }

    if (!purchase) {
      return reply.status(404).send({ message: "Purchase record not found" });
    }

    const userId = (purchase.user as any).toString();

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return reply.status(500).send({
        message: "Payment gateway not configured. Please contact support.",
        error: "PAYMENT_GATEWAY_NOT_CONFIGURED"
      });
    }

    // Re-fetch purchase with populated package (use the found purchase)
    const purchaseWithPackage = await Purchase.findById(purchase._id).populate("package");
    if (!purchaseWithPackage) {
      return reply.status(404).send({ message: "Purchase record not found" });
    }

    // Verify order ID matches
    if (purchaseWithPackage.razorpayOrderId !== razorpay_order_id) {
      return reply.status(400).send({ message: "Order ID mismatch" });
    }

    // Use Razorpay's official verification utility
    const isValidSignature = validatePaymentVerification(
      {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      },
      razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET!
    );

    if (isValidSignature) {
      try {
        // Step 1: Fetch payment details to check current status
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        console.log("Payment details fetched:", {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
          captured: payment.captured
        });

        // Step 2: Handle payment capture (auto-capture may not work with orders)
        let captureResult = null;
        if (payment.status === 'authorized' && !payment.captured) {
          console.log("Payment authorized but not captured. Capturing now...");

          captureResult = await razorpay.payments.capture(
            razorpay_payment_id,
            payment.amount,
            'INR'
          );

          console.log("Manual capture result:", captureResult);
        } else if (payment.status === 'captured') {
          console.log("Payment already captured by auto-capture");
        }

        // Step 3: Update purchase record based on final payment status
        purchaseWithPackage.razorpayPaymentId = razorpay_payment_id;
        purchaseWithPackage.razorpaySignature = razorpay_signature;

        // Set status based on actual payment state
        const isCaptured = payment.captured || payment.status === 'captured' ||
          (captureResult && captureResult.captured);

        if (isCaptured) {
          purchaseWithPackage.status = "captured";
          console.log("✅ Payment captured successfully");

          // Add package to student only after successful capture
          console.log("📚 About to add package to student:", {
            userId,
            packageId: (purchaseWithPackage.package as any)._id,
            userType: "will check in function"
          });

          try {
            await addPackageToStudent(userId, (purchaseWithPackage.package as any)._id);
            console.log("✅ Package assignment completed successfully");
          } catch (packageError) {
            console.error("❌ Package assignment failed:", packageError);
          }

          // Send invoice email (await to ensure it completes in Lambda environment)
          try {
            await sendInvoiceEmail((purchaseWithPackage as any)._id.toString());
          } catch (emailError) {
            console.error("❌ Invoice email sending failed:", emailError);
            // Don't throw - email failure shouldn't break the purchase flow
          }
        } else if (payment.status === 'authorized') {
          purchaseWithPackage.status = "authorized";
          console.log("⚠️ Payment authorized but not captured");
        } else {
          purchaseWithPackage.status = "failed";
          console.log("❌ Payment in unexpected status:", payment.status);
        }

        await purchaseWithPackage.save();

        reply.status(200).send({
          message: purchaseWithPackage.status === "captured" ? "Payment captured successfully" : "Payment authorized but not captured",
          purchase: purchaseWithPackage,
          packageAccess: purchaseWithPackage.status === "captured" ? "granted" : "pending",
          paymentStatus: payment.status,
          captured: payment.captured || payment.status === 'captured' || (captureResult && captureResult.captured)
        });

      } catch (paymentError: any) {
        console.error("Error processing payment:", paymentError);

        // Update purchase as failed
        purchaseWithPackage.razorpayPaymentId = razorpay_payment_id;
        purchaseWithPackage.razorpaySignature = razorpay_signature;
        purchaseWithPackage.status = "failed";
        purchaseWithPackage.failureReason = paymentError.message || "Payment processing failed";
        await purchaseWithPackage.save();

        reply.status(400).send({
          message: "Payment processing failed",
          error: paymentError.message,
          purchase: purchaseWithPackage
        });
      }
    } else {
      // Invalid signature
      purchaseWithPackage.status = "failed";
      await purchaseWithPackage.save();
      reply.status(400).send({ message: "Payment verification failed" });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    reply.status(500).send({ message: "Failed to verify payment", error });
  }
};

// Helper function to add package to student
const addPackageToStudent = async (userId: string, packageId: string) => {
  try {
    console.log(`🔍 Starting addPackageToStudent - userId: ${userId}, packageId: ${packageId}`);

    // First check if user exists and get their type
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      throw new Error("User not found");
    }

    console.log(`✅ User found: ${user.email}, type: ${user.userType}, current packages: ${(user as any).packages?.length || 0}`);

    // Only students can have packages
    if (user.userType !== 'Student') {
      console.log(`⚠️ User ${user.email} is not a student (type: ${user.userType}), cannot add packages`);
      return;
    }

    console.log(`📝 Attempting to add package ${packageId} to student ${userId}`);

    // Use MongoDB update operation to add package (handles duplicates automatically)
    const updateResult = await User.updateOne(
      { _id: userId, userType: 'Student' },
      { $addToSet: { packages: packageId } }
    );

    console.log(`📝 MongoDB update result:`, {
      acknowledged: updateResult.acknowledged,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      upsertedCount: updateResult.upsertedCount
    });

    if (updateResult.matchedCount === 0) {
      console.error(`❌ No student user found with ID ${userId}`);
      throw new Error("Student user not found for package assignment");
    }

    if (updateResult.modifiedCount > 0) {
      console.log(`✅ Package ${packageId} successfully added to student ${userId}`);
    } else {
      console.log(`ℹ️ Package ${packageId} already exists for student ${userId}`);
    }

    // Verify the update
    const verifyUser = await User.findById(userId);
    const packageCount = (verifyUser as any)?.packages?.length || 0;
    const hasPackage = (verifyUser as any)?.packages?.includes(packageId);

    console.log(`🔍 Final verification:`, {
      userId,
      packageId,
      totalPackages: packageCount,
      hasThisPackage: hasPackage,
      userType: verifyUser?.userType
    });

  } catch (error) {
    console.error("❌ Error in addPackageToStudent:", error);
    throw error;
  }
};

// Helper function to generate invoice PDF as a Buffer (for email attachment)
const generateInvoicePdfBuffer = async (purchaseId: string): Promise<Buffer | null> => {
  try {
    console.log(`📄 Generating invoice PDF for purchase: ${purchaseId}`);

    // Get purchase with populated user and package data
    const purchase = await Purchase.findById(purchaseId)
      .populate("user", "fullname email phone")
      .populate("package", "name description price duration");

    if (!purchase || purchase.status !== "captured") {
      console.log(`❌ Cannot generate invoice: Purchase not found or not captured`);
      return null;
    }

    const populatedUser = purchase.user as any;
    const populatedPackage = purchase.package as any;

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    // Set up data collection
    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    // Handle PDF completion
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          console.log(`✅ Invoice PDF generated, size: ${pdfBuffer.length} bytes`);
          resolve(pdfBuffer);
        } catch (error) {
          console.error("Error concatenating PDF chunks:", error);
          reject(error);
        }
      });

      doc.on("error", (error) => {
        console.error("PDF generation error:", error);
        reject(error);
      });
    });

    // App brand colors
    const primaryBlue = "#3B82F6";
    const successGreen = "#22C55E";
    const darkGray = "#1F2937";
    const lightGray = "#F8FAFC";
    const white = "#FFFFFF";
    const textGray = "#6B7280";

    // Header with brand colors
    doc.fillColor(primaryBlue);
    doc.rect(0, 0, doc.page.width, 140).fill();

    // Company header
    doc
      .fillColor(white)
      .fontSize(24)
      .font("Helvetica-Bold")
      .text("Prayash Assets", 50, 40);

    doc
      .fontSize(12)
      .font("Helvetica")
      .text("Educational Excellence", 50, 75)
      .text("Wanless Housing Society, Near Vinayak Nagar", 50, 88)
      .text("Wanlesswadi", 50, 101)
      .text("Phone: +91 70209 26032", 50, 114)
      .text("Email: support@prayashassets.com", 50, 127);

    // Payment Success badge
    doc
      .fillColor(white)
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("PAYMENT SUCCESSFUL", 430, 65);

    // Reset to dark gray
    doc.fillColor(darkGray);

    // Receipt title
    doc.fillColor(lightGray).rect(50, 160, doc.page.width - 100, 40).fill();
    doc
      .fillColor(darkGray)
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("PAYMENT RECEIPT", 50, 175);

    // Receipt details
    doc.fontSize(12).font("Helvetica");
    const leftColumn = 70;
    const rightColumn = 320;
    let yPosition = 230;

    // Receipt information section
    doc.fillColor(primaryBlue).fontSize(14).font("Helvetica-Bold").text("RECEIPT INFORMATION", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");
    doc.text("Receipt Number:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(purchase.razorpayPaymentId || "N/A", rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Order ID:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(purchase.razorpayOrderId, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Payment Date:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(
      new Date(purchase.createdAt).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rightColumn,
      yPosition
    );
    yPosition += 18;

    doc.font("Helvetica").text("Status:", leftColumn, yPosition);
    doc.fillColor(successGreen).font("Helvetica-Bold").text("Paid", rightColumn, yPosition);
    doc.fillColor(darkGray);
    yPosition += 35;

    // Customer details section
    doc.fillColor(primaryBlue).fontSize(14).font("Helvetica-Bold").text("CUSTOMER DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");
    doc.text("Name:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(populatedUser.fullname, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Email:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(populatedUser.email, rightColumn, yPosition);
    yPosition += 18;

    if (populatedUser.phone) {
      doc.font("Helvetica").text("Phone:", leftColumn, yPosition);
      doc.font("Helvetica-Bold").text(populatedUser.phone.toString(), rightColumn, yPosition);
      yPosition += 18;
    }
    yPosition += 25;

    // Package details section
    doc.fillColor(primaryBlue).fontSize(14).font("Helvetica-Bold").text("PACKAGE DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");
    doc.text("Package Name:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(populatedPackage.name, rightColumn, yPosition);
    yPosition += 18;

    if (populatedPackage.description) {
      doc.font("Helvetica").text("Description:", leftColumn, yPosition);
      doc.font("Helvetica-Bold").text(populatedPackage.description, rightColumn, yPosition, { width: 200, height: 50 });
      yPosition += 50;
    }

    if (populatedPackage.duration) {
      doc.font("Helvetica").text("Validity Period:", leftColumn, yPosition);
      doc.font("Helvetica-Bold").text(`${populatedPackage.duration} days`, rightColumn, yPosition);
      yPosition += 18;
    }
    yPosition += 25;

    // Payment details section
    doc.fillColor(primaryBlue).fontSize(14).font("Helvetica-Bold").text("PAYMENT DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");
    doc.text("Amount:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(`₹${purchase.amount.toFixed(2)}`, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Currency:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(purchase.currency, rightColumn, yPosition);
    yPosition += 35;

    // Total amount box
    doc.fillColor(successGreen).roundedRect(leftColumn, yPosition, 450, 40, 5).fill();
    doc.fillColor(white).fontSize(16).font("Helvetica-Bold").text("TOTAL AMOUNT PAID:", leftColumn + 15, yPosition + 15);
    doc.fontSize(18).text(`₹${purchase.amount.toFixed(2)}`, rightColumn + 80, yPosition + 15);
    yPosition += 70;

    // Footer
    doc
      .fillColor(textGray)
      .fontSize(10)
      .font("Helvetica")
      .text("This is a computer-generated receipt and does not require a signature.", leftColumn, yPosition);
    doc.text("For any queries, please contact us at support@prayashassets.com", leftColumn, yPosition + 15);

    // End the PDF document
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await pdfPromise;
    return pdfBuffer.length > 0 ? pdfBuffer : null;

  } catch (error) {
    console.error("❌ Error generating invoice PDF:", error);
    return null;
  }
};

// Helper function to send invoice email after purchase
const sendInvoiceEmail = async (purchaseId: string): Promise<void> => {
  try {
    console.log(`📧 [INVOICE EMAIL] Starting for purchase: ${purchaseId}`);

    // Get purchase with populated data
    const purchase = await Purchase.findById(purchaseId)
      .populate("user", "fullname email")
      .populate("package", "name");

    if (!purchase) {
      console.error("❌ [INVOICE EMAIL] Purchase not found:", purchaseId);
      return;
    }

    const populatedUser = purchase.user as any;
    const populatedPackage = purchase.package as any;

    console.log(`📧 [INVOICE EMAIL] Sending to: ${populatedUser.email}, Package: ${populatedPackage.name}`);

    // Generate the invoice PDF
    console.log(`📧 [INVOICE EMAIL] Generating PDF...`);
    const invoicePdf = await generateInvoicePdfBuffer(purchaseId);
    if (!invoicePdf) {
      console.error("❌ [INVOICE EMAIL] Failed to generate invoice PDF");
      return;
    }
    console.log(`📧 [INVOICE EMAIL] PDF generated, size: ${invoicePdf.length} bytes`);

    // Send the email with invoice attachment
    console.log(`📧 [INVOICE EMAIL] Sending email via email service...`);
    const emailSent = await emailService.sendPurchaseInvoice(
      populatedUser.email,
      populatedUser.fullname,
      populatedPackage.name,
      purchase.amount,
      purchase.razorpayPaymentId || purchase.razorpayOrderId,
      invoicePdf
    );

    if (emailSent) {
      console.log(`✅ [INVOICE EMAIL] Email sent successfully to ${populatedUser.email}`);
    } else {
      console.error(`❌ [INVOICE EMAIL] Email service returned false for ${populatedUser.email}`);
    }
  } catch (error) {
    console.error("❌ [INVOICE EMAIL] Error:", error);
    // Don't throw - we don't want email failure to break the purchase flow
  }
};

export const getPurchaseById = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const userId = (req as any).user.id;
    const userRoles = (req as any).user.roles || [];
    const userType = (req as any).user.userType;
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin") || userType === "admin" || userType === "Admin";

    const purchase = await Purchase.findById(req.params.id)
      .populate("user", "fullname email phone")
      .populate("package", "name description price duration");

    if (!purchase) {
      return reply.status(404).send({ message: "Purchase not found" });
    }

    // Check if user has access to this purchase
    if (!isAdmin && (purchase.user as any)._id.toString() !== userId) {
      return reply.status(403).send({ message: "Access denied" });
    }

    reply.status(200).send(purchase);
  } catch (error) {
    reply.status(500).send({ message: "Failed to retrieve purchase", error });
  }
};

export const getUserPurchases = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const userId = (req as any).user.id;
    const userRoles = (req as any).user.roles || [];
    const userType = (req as any).user.userType;
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin") || userType === "admin" || userType === "Admin";

    const page = parseInt((req.query as any)?.page || '1');
    const limit = parseInt((req.query as any)?.limit || '10');
    const search = (req.query as any)?.search;
    const status = (req.query as any)?.status;
    const skip = (page - 1) * limit;

    let baseQuery = {};
    let searchQuery = {};

    if (!isAdmin) {
      baseQuery = {
        user: userId,
        status: { $in: ["captured", "authorized", "created"] }
      };
    }

    if (search) {
      searchQuery = {
        $or: [
          { razorpayPaymentId: { $regex: search, $options: 'i' } },
          { razorpayOrderId: { $regex: search, $options: 'i' } }
        ]
      };
    }

    if (status && status !== 'all') {
      baseQuery = { ...baseQuery, status };
    }

    const finalQuery = { ...baseQuery, ...searchQuery };

    const [purchases, totalPurchases] = await Promise.all([
      Purchase.find(finalQuery)
        .populate("user", "fullname email phone")
        .populate("package", "name description price duration")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Purchase.countDocuments(finalQuery)
    ]);

    const totalPages = Math.ceil(totalPurchases / limit);

    reply.status(200).send({
      purchases,
      pagination: {
        currentPage: page,
        totalPages,
        totalPurchases,
        purchasesPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error in getUserPurchases:', error);
    reply.status(500).send({ message: "Failed to retrieve purchases", error });
  }
};

// Cancel a pending order
export const cancelOrder = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const purchaseId = req.params.id;
    const userId = (req as any).user.id;

    // Find the purchase record
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      return reply.status(404).send({ message: "Purchase not found" });
    }

    // Verify the purchase belongs to the current user
    if ((purchase.user as any).toString() !== userId) {
      return reply.status(403).send({ message: "Access denied" });
    }

    // Only allow cancellation of pending orders
    if (purchase.status !== "created") {
      return reply.status(400).send({
        message: "Only pending orders can be cancelled",
        currentStatus: purchase.status,
      });
    }

    // Update the purchase status to cancelled
    purchase.status = "cancelled" as any; // We'll need to update the enum in the model
    purchase.failureReason = "Cancelled by user";
    await purchase.save();

    console.log(`Order ${purchaseId} cancelled by user ${userId}`);

    reply.status(200).send({
      message: "Order cancelled successfully",
      purchase: {
        _id: purchase._id,
        status: purchase.status,
        razorpayOrderId: purchase.razorpayOrderId,
        package: purchase.package,
      },
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    reply.status(500).send({
      message: "Failed to cancel order",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get pending orders for a user
export const getPendingOrders = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const userId = (req as any).user.id;

    const pendingOrders = await Purchase.find({
      user: userId,
      status: "created",
    })
      .populate("package", "name description price duration")
      .sort({ createdAt: -1 });

    reply.status(200).send(pendingOrders);
  } catch (error) {
    console.error("Error fetching pending orders:", error);
    reply.status(500).send({
      message: "Failed to retrieve pending orders",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Generate and download receipt
export const generateReceipt = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const purchaseId = req.params.id;
    const userId = (req as any).user.id;
    const userRoles = (req as any).user.roles || [];
    const userType = (req as any).user.userType;
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin") || userType === "admin" || userType === "Admin";

    console.log(`Generating receipt for purchase: ${purchaseId}`);

    // Get purchase with populated user and package data
    const purchase = await Purchase.findById(purchaseId)
      .populate("user", "fullname email phone")
      .populate("package", "name description price duration");

    if (!purchase) {
      console.log(`Purchase not found: ${purchaseId}`);
      return reply.status(404).send({ message: "Purchase not found" });
    }

    console.log(`Purchase found: ${purchase._id}, Status: ${purchase.status}`);

    // Check access permissions - Admin can access all receipts, users can only access their own
    const populatedUser = purchase.user as any;
    if (!isAdmin && populatedUser._id.toString() !== userId) {
      console.log(`Access denied for user: ${userId}`);
      return reply.status(403).send({ message: "Access denied" });
    }

    // Only generate receipts for successful payments
    if (purchase.status !== "captured") {
      console.log(`Receipt not available for status: ${purchase.status}`);
      return reply
        .status(400)
        .send({ message: "Receipt not available for incomplete payments" });
    }

    console.log("Starting PDF generation...");

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    // Use built-in PDFKit fonts only (do not register .afm files)
    // PDFKit supports: 'Helvetica', 'Helvetica-Bold', 'Times-Roman', etc.

    const chunks: Buffer[] = [];

    // Set up data collection
    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    // Handle PDF completion
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          console.log(
            `PDF generated successfully, size: ${pdfBuffer.length} bytes`
          );
          resolve(pdfBuffer);
        } catch (error) {
          console.error("Error concatenating PDF chunks:", error);
          reject(error);
        }
      });

      doc.on("error", (error) => {
        console.error("PDF generation error:", error);
        reject(error);
      });
    });

    // Add content to PDF
    const populatedPackage = purchase.package as any;

    // App brand colors (using hex format for PDFKit)
    const primaryBlue = "#3B82F6";
    const successGreen = "#22C55E";
    const darkGray = "#1F2937";
    const lightGray = "#F8FAFC";
    const white = "#FFFFFF";
    const textGray = "#6B7280";

    // Header with brand colors
    doc.fillColor(primaryBlue);
    doc.rect(0, 0, doc.page.width, 140).fill();

    // Company header in white on blue background - smaller fonts
    doc
      .fillColor(white)
      .fontSize(24) // Reduced from 28
      .font("Helvetica-Bold")
      .text("Prayash Assets", 50, 40);

    doc
      .fontSize(12) // Reduced from 14
      .font("Helvetica")
      .text("Educational Excellence", 50, 75)
      .text("Wanless Housing Society, Near Vinayak Nagar", 50, 88) // Adjusted position
      .text("Wanlesswadi", 50, 101) // Adjusted position
      .text("Phone: +91 70209 26032", 50, 114) // Adjusted position
      .text("Email: support@prayashassets.com", 50, 127); // Adjusted position

    // Payment Success text without background - just text
    doc
      .fillColor(white)
      .fontSize(10) // Reduced from 12
      .font("Helvetica-Bold")
      .text("PAYMENT SUCCESSFUL", 430, 65); // Removed background rectangle

    // Reset to dark gray for main content
    doc.fillColor(darkGray);

    // Receipt title with colored background
    doc
      .fillColor(lightGray)
      .rect(50, 160, doc.page.width - 100, 40)
      .fill();

    doc
      .fillColor(darkGray)
      .fontSize(20) // Reduced from 22
      .font("Helvetica-Bold")
      .text("PAYMENT RECEIPT", 50, 175);

    // Receipt details
    doc.fontSize(12).font("Helvetica");
    const leftColumn = 70;
    const rightColumn = 320;
    let yPosition = 230;

    // Add subtle borders and better spacing
    doc.strokeColor("#C8C8C8").lineWidth(0.5);

    // Receipt information section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("RECEIPT INFORMATION", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Receipt Number:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(purchase.razorpayPaymentId || "N/A", rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Order ID:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(purchase.razorpayOrderId, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Payment Date:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(
      new Date(purchase.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rightColumn,
      yPosition
    );
    yPosition += 18;

    doc.font("Helvetica").text("Status:", leftColumn, yPosition);
    doc
      .fillColor(successGreen)
      .font("Helvetica-Bold")
      .text("Paid", rightColumn, yPosition); // Changed from CAPTURED to Paid

    doc.fillColor(darkGray);
    yPosition += 35;

    // Customer details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("CUSTOMER DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Name:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedUser.fullname, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Email:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedUser.email, rightColumn, yPosition);
    yPosition += 18;

    if (populatedUser.phone) {
      doc.font("Helvetica").text("Phone:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(populatedUser.phone.toString(), rightColumn, yPosition);
      yPosition += 18;
    }
    yPosition += 25;

    // Package details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("PACKAGE DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Package Name:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedPackage.name, rightColumn, yPosition);
    yPosition += 18;

    if (populatedPackage.description) {
      doc.font("Helvetica").text("Description:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(populatedPackage.description, rightColumn, yPosition, {
          width: 200,
          height: 50,
        });
      yPosition += 50;
    }

    if (populatedPackage.duration) {
      doc.font("Helvetica").text("Validity Period:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(`${populatedPackage.duration} days`, rightColumn, yPosition);
      yPosition += 18;
    }

    yPosition += 25;

    // Payment details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("PAYMENT DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Amount:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(`₹${purchase.amount.toFixed(2)}`, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Currency:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(purchase.currency, rightColumn, yPosition);
    yPosition += 35;

    // Total amount box with app colors
    doc
      .fillColor(successGreen)
      .roundedRect(leftColumn, yPosition, 450, 40, 5)
      .fill();

    doc
      .fillColor(white)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("TOTAL AMOUNT PAID:", leftColumn + 15, yPosition + 15);

    doc
      .fontSize(18)
      .text(`₹${purchase.amount.toFixed(2)}`, rightColumn + 80, yPosition + 15);

    yPosition += 70;

    // Footer
    doc
      .fillColor(textGray)
      .fontSize(10)
      .font("Helvetica")
      .text(
        "This is a computer-generated receipt and does not require a signature.",
        leftColumn,
        yPosition
      );

    doc.text(
      "For any queries, please contact us at support@prayashassets.com",
      leftColumn,
      yPosition + 15
    );

    // End the PDF document
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await pdfPromise;

    if (pdfBuffer.length === 0) {
      console.error("Generated PDF buffer is empty");
      return reply.status(500).send({
        message: "Failed to generate PDF - empty buffer",
      });
    }

    console.log(`Sending PDF response, size: ${pdfBuffer.length} bytes`);

    // Set response headers and send PDF
    reply.header("Content-Type", "application/pdf");
    reply.header(
      "Content-Disposition",
      `attachment; filename="receipt-${purchase.razorpayPaymentId || "receipt"
      }.pdf"`
    );
    reply.header("Content-Length", pdfBuffer.length.toString());

    return reply.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating receipt:", error);
    if (!reply.sent) {
      return reply.status(500).send({
        message: "Failed to generate receipt",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
};

// Manual capture endpoint for testing/admin use
export const capturePayment = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const purchaseId = req.params.id;
    const userRoles = (req as any).user.roles || [];
    const userType = (req as any).user.userType;
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin") || userType === "admin" || userType === "Admin";

    if (!isAdmin) {
      return reply.status(403).send({ message: "Admin access required" });
    }

    const purchase = await Purchase.findById(purchaseId).populate("package");
    if (!purchase) {
      return reply.status(404).send({ message: "Purchase not found" });
    }

    if (!purchase.razorpayPaymentId) {
      return reply.status(400).send({ message: "No payment ID found" });
    }

    if (purchase.status === "captured") {
      return reply.status(400).send({ message: "Payment already captured" });
    }

    // Fetch payment details
    const payment = await razorpay.payments.fetch(purchase.razorpayPaymentId);

    if (payment.status !== 'authorized') {
      return reply.status(400).send({
        message: "Payment is not in authorized state",
        currentStatus: payment.status
      });
    }

    // Capture the payment
    const captureResult = await razorpay.payments.capture(
      purchase.razorpayPaymentId,
      payment.amount,
      'INR'
    );

    if (captureResult.captured) {
      purchase.status = "captured";
      await purchase.save();

      // Add package to user
      await addPackageToStudent(
        (purchase.user as any).toString(),
        (purchase.package as any)._id.toString()
      );

      reply.status(200).send({
        message: "Payment captured successfully",
        purchase,
        captureResult
      });
    } else {
      reply.status(400).send({
        message: "Payment capture failed",
        captureResult
      });
    }
  } catch (error) {
    console.error("Error capturing payment:", error);
    reply.status(500).send({
      message: "Failed to capture payment",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// View receipt in browser (similar to generateReceipt but with inline display)
export const viewReceipt = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const purchaseId = req.params.id;
    const userId = (req as any).user.id;
    const userRoles = (req as any).user.roles || [];
    const userType = (req as any).user.userType;
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin") || userType === "admin" || userType === "Admin";

    console.log(`Viewing receipt for purchase: ${purchaseId}`);

    // Get purchase with populated user and package data
    const purchase = await Purchase.findById(purchaseId)
      .populate("user", "fullname email phone")
      .populate("package", "name description price duration");

    if (!purchase) {
      console.log(`Purchase not found: ${purchaseId}`);
      return reply.status(404).send({ message: "Purchase not found" });
    }

    // Check access permissions - Admin can access all receipts, users can only access their own
    const populatedUser = purchase.user as any;
    if (!isAdmin && populatedUser._id.toString() !== userId) {
      console.log(`Access denied for user: ${userId}`);
      return reply.status(403).send({ message: "Access denied" });
    }

    // Only generate receipts for successful payments
    if (purchase.status !== "captured") {
      console.log(`Receipt not available for status: ${purchase.status}`);
      return reply
        .status(400)
        .send({ message: "Receipt not available for incomplete payments" });
    }

    console.log("Starting PDF generation for viewing...");

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    // Register custom fonts (must use .ttf or .otf, not .afm)
    // Commenting out .afm registration due to "Unknown font format" error
    // const fontDir = path.join(__dirname, "../../data");
    // doc.registerFont("Helvetica", path.join(fontDir, "Helvetica.afm"));
    // doc.registerFont(
    //   "Helvetica-Bold",
    //   path.join(fontDir, "Helvetica-Bold.afm")
    // );
    // Use built-in PDFKit fonts instead
    // PDFKit supports: 'Helvetica', 'Times-Roman', 'Courier', etc.

    const chunks: Buffer[] = [];

    // Set up data collection
    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    // Handle PDF completion
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          console.log(
            `PDF generated successfully for viewing, size: ${pdfBuffer.length} bytes`
          );
          resolve(pdfBuffer);
        } catch (error) {
          console.error("Error concatenating PDF chunks for viewing:", error);
          reject(error);
        }
      });

      doc.on("error", (error) => {
        console.error("PDF generation error for viewing:", error);
        reject(error);
      });
    });

    // Add content to PDF (same styling as generateReceipt)
    const populatedPackage = purchase.package as any;

    // App brand colors (using hex format for PDFKit)
    const primaryBlue = "#3B82F6";
    const successGreen = "#22C55E";
    const darkGray = "#1F2937";
    const lightGray = "#F8FAFC";
    const white = "#FFFFFF";
    const textGray = "#6B7280";

    // Header with brand colors
    doc.fillColor(primaryBlue);
    doc.rect(0, 0, doc.page.width, 140).fill();

    // Company header in white on blue background - smaller fonts
    doc
      .fillColor(white)
      .fontSize(24) // Reduced from 28
      .font("Helvetica-Bold")
      .text("Prayash Assets", 50, 40);

    doc
      .fontSize(12) // Reduced from 14
      .font("Helvetica")
      .text("Educational Excellence", 50, 75)
      .text("Wanless Housing Society, Near Vinayak Nagar", 50, 88) // Adjusted position
      .text("Wanlesswadi", 50, 101) // Adjusted position
      .text("Phone: +91 70209 26032", 50, 114) // Adjusted position
      .text("Email: support@prayashassets.com", 50, 127); // Adjusted position

    // Payment Success text without background - just text
    doc
      .fillColor(white)
      .fontSize(10) // Reduced from 12
      .font("Helvetica-Bold")
      .text("PAYMENT SUCCESSFUL", 430, 65); // Removed background rectangle

    // Reset to dark gray for main content
    doc.fillColor(darkGray);

    // Receipt title with colored background
    doc
      .fillColor(lightGray)
      .rect(50, 160, doc.page.width - 100, 40)
      .fill();

    doc
      .fillColor(darkGray)
      .fontSize(20) // Reduced from 22
      .font("Helvetica-Bold")
      .text("PAYMENT RECEIPT", 50, 175);

    // Receipt details
    doc.fontSize(12).font("Helvetica");
    const leftColumn = 70;
    const rightColumn = 320;
    let yPosition = 230;

    // Receipt information section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("RECEIPT INFORMATION", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Receipt Number:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(purchase.razorpayPaymentId || "N/A", rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Order ID:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(purchase.razorpayOrderId, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Payment Date:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(
      new Date(purchase.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rightColumn,
      yPosition
    );
    yPosition += 18;

    doc.font("Helvetica").text("Status:", leftColumn, yPosition);
    doc
      .fillColor(successGreen)
      .font("Helvetica-Bold")
      .text("Paid", rightColumn, yPosition); // Changed from CAPTURED to Paid

    doc.fillColor(darkGray);
    yPosition += 35;

    // Customer details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("CUSTOMER DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Name:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedUser.fullname, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Email:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedUser.email, rightColumn, yPosition);
    yPosition += 18;

    if (populatedUser.phone) {
      doc.font("Helvetica").text("Phone:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(populatedUser.phone.toString(), rightColumn, yPosition);
      yPosition += 18;
    }
    yPosition += 25;

    // Package details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("PACKAGE DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Package Name:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(populatedPackage.name, rightColumn, yPosition);
    yPosition += 18;

    if (populatedPackage.description) {
      doc.font("Helvetica").text("Description:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(populatedPackage.description, rightColumn, yPosition, {
          width: 200,
          height: 50,
        });
      yPosition += 50;
    }

    if (populatedPackage.duration) {
      doc.font("Helvetica").text("Validity Period:", leftColumn, yPosition);
      doc
        .font("Helvetica-Bold")
        .text(`${populatedPackage.duration} days`, rightColumn, yPosition);
      yPosition += 18;
    }

    yPosition += 25;

    // Payment details section
    doc
      .fillColor(primaryBlue)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("PAYMENT DETAILS", leftColumn, yPosition);
    yPosition += 25;

    doc.fillColor(darkGray).fontSize(11).font("Helvetica");

    doc.text("Amount:", leftColumn, yPosition);
    doc
      .font("Helvetica-Bold")
      .text(`₹${purchase.amount.toFixed(2)}`, rightColumn, yPosition);
    yPosition += 18;

    doc.font("Helvetica").text("Currency:", leftColumn, yPosition);
    doc.font("Helvetica-Bold").text(purchase.currency, rightColumn, yPosition);
    yPosition += 35;

    // Total amount box with app colors
    doc
      .fillColor(successGreen)
      .roundedRect(leftColumn, yPosition, 450, 40, 5)
      .fill();

    doc
      .fillColor(white)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("TOTAL AMOUNT PAID:", leftColumn + 15, yPosition + 15);

    doc
      .fontSize(18)
      .text(`₹${purchase.amount.toFixed(2)}`, rightColumn + 80, yPosition + 15);

    yPosition += 70;

    // Footer
    doc
      .fillColor(textGray)
      .fontSize(10)
      .font("Helvetica")
      .text(
        "This is a computer-generated receipt and does not require a signature.",
        leftColumn,
        yPosition
      );

    doc.text(
      "For any queries, please contact us at support@prayashassets.com",
      leftColumn,
      yPosition + 15
    );

    // End the PDF document
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await pdfPromise;

    if (pdfBuffer.length === 0) {
      console.error("Generated PDF buffer is empty");
      return reply.status(500).send({
        message: "Failed to generate PDF - empty buffer",
      });
    }

    console.log(
      `Sending PDF response for viewing, size: ${pdfBuffer.length} bytes`
    );

    // Set response headers for inline viewing
    reply.header("Content-Type", "application/pdf");
    reply.header(
      "Content-Disposition",
      `inline; filename="receipt-${purchase.razorpayPaymentId || "receipt"
      }.pdf"`
    );
    reply.header("Content-Length", pdfBuffer.length.toString());

    // Send the PDF buffer
    reply.send(pdfBuffer);
  } catch (error) {
    console.error("Error viewing receipt:", error);
    if (!reply.sent) {
      reply.status(500).send({
        message: "Failed to view receipt",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
};
