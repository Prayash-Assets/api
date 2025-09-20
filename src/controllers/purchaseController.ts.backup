import { FastifyRequest, FastifyReply } from "fastify";
import Purchase, { IPurchase } from "../models/Purchase";
import Package from "../models/Package";
import User, { Student } from "../models/User";
import Razorpay from "razorpay";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";
import PDFDocument from "pdfkit";
import path from "path";

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

    reply.status(201).send({
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
    });
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

    const userId = (req as any).user.id;

    // Find purchase record
    const purchase = await Purchase.findById(purchaseId).populate("package");
    if (!purchase) {
      return reply.status(404).send({ message: "Purchase record not found" });
    }

    // Verify the purchase belongs to the current user
    if ((purchase.user as any).toString() !== userId) {
      return reply
        .status(403)
        .send({ message: "Unauthorized purchase verification" });
    }

    // Verify order ID matches
    if (purchase.razorpayOrderId !== razorpay_order_id) {
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
      // Payment is valid, update purchase record
      purchase.razorpayPaymentId = razorpay_payment_id;
      purchase.razorpaySignature = razorpay_signature;
      purchase.status = "captured";
      await purchase.save();

      // Add package to student's purchased packages
      await addPackageToStudent(userId, (purchase.package as any)._id);

      // Fetch payment details from Razorpay for additional verification
      try {
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        console.log("Payment verified:", {
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
        });
      } catch (paymentFetchError) {
        console.error("Could not fetch payment details:", paymentFetchError);
        // Don't fail the verification if payment fetch fails
      }

      reply.status(200).send({
        message: "Payment verified successfully",
        purchase,
        packageAccess: "granted",
      });
    } else {
      // Invalid signature
      purchase.status = "failed";
      await purchase.save();
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
    const student = await Student.findById(userId);
    if (!student) {
      throw new Error("Student not found");
    }

    // Check if package is already in student's packages
    const packageExists = student.packages?.some(
      (pkg: any) => pkg.toString() === packageId.toString()
    );

    if (!packageExists) {
      if (!student.packages) {
        student.packages = [];
      }
      student.packages.push(packageId as any);
      await student.save();
      console.log(`Package ${packageId} added to student ${userId}`);
    }
  } catch (error) {
    console.error("Error adding package to student:", error);
    throw error;
  }
};

export const getPurchaseById = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const userId = (req as any).user.id;
    const userRoles = (req as any).userRoles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin");

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
    const userRoles = (req as any).userRoles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin");

    let purchases;

    if (isAdmin) {
      // Admin can see all purchases
      purchases = await Purchase.find({})
        .populate("user", "fullname email phone")
        .populate("package", "name description price duration")
        .sort({ createdAt: -1 });
    } else {
      // Regular users can see their own purchases including pending ones
      purchases = await Purchase.find({
        user: userId,
        status: { $in: ["captured", "authorized", "created"] }, // Include pending orders
      })
        .populate("package", "name description price duration")
        .sort({ createdAt: -1 });
    }

    reply.status(200).send(purchases);
  } catch (error) {
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
    const userRoles = (req as any).userRoles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin");

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
      .text("Prayas Assets", 50, 40);

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
      `attachment; filename="receipt-${
        purchase.razorpayPaymentId || "receipt"
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

// View receipt in browser (similar to generateReceipt but with inline display)
export const viewReceipt = async (
  req: FastifyRequest<{ Params: GetOrDeletePurchaseParams }>,
  reply: FastifyReply
) => {
  try {
    const purchaseId = req.params.id;
    const userId = (req as any).user.id;
    const userRoles = (req as any).userRoles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("Admin");

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
      .text("Prayas Assets", 50, 40);

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
      `inline; filename="receipt-${
        purchase.razorpayPaymentId || "receipt"
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
