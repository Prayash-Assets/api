import { FastifyInstance, FastifyPluginOptions } from "fastify";
import {
  createOrder,
  verifyPayment,
  getPurchaseById,
  getUserPurchases,
  generateReceipt,
  viewReceipt,
  cancelOrder,
  getPendingOrders,
  capturePayment,
  assignPackageManually,
} from "../controllers/purchaseController";
import { checkRoles as rbacMiddleware } from "../middleware/rbacMiddleware";

import {
  CreateOrderBody,
  VerifyPaymentBody,
  GetOrDeletePurchaseParams,
} from "../controllers/purchaseController"; // Import interfaces

export default async function purchaseRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Create a new Razorpay order and initial purchase record
  fastify.post<{ Body: CreateOrderBody }>(
    "/order",
    {
      preHandler: [rbacMiddleware(["student"])]
    },
    createOrder
  );

  // Verify payment and update purchase status
  fastify.post<{ Body: VerifyPaymentBody }>(
    "/verify",
    {
      preHandler: [rbacMiddleware(["student"])]
    },
    verifyPayment
  );

  // Get a specific purchase by ID (admin or owner)
  fastify.get<{ Params: GetOrDeletePurchaseParams }>(
    "/:id",
    {
      preHandler: [rbacMiddleware(["admin", "student"])]
    },
    getPurchaseById // Add more specific owner check in controller if needed
  );

  // Cancel a pending order
  fastify.delete<{ Params: GetOrDeletePurchaseParams }>(
    "/:id/cancel",
    {
      preHandler: [rbacMiddleware(["student"])]
    },
    cancelOrder
  );

  // Manual capture payment (admin only)
  fastify.post<{ Params: GetOrDeletePurchaseParams }>(
    "/:id/capture",
    {
      preHandler: [rbacMiddleware(["admin"])]
    },
    capturePayment
  );

  // Manual assign package (admin only)
  fastify.post<{ Body: { userId: string; packageId: string; paymentMode: string; notes?: string } }>(
    "/assign",
    {
      preHandler: [rbacMiddleware(["admin"])]
    },
    assignPackageManually
  );

  // Get pending orders for the logged-in user
  fastify.get(
    "/pending",
    {
      preHandler: [rbacMiddleware(["student"])]
    },
    getPendingOrders
  );

  // View receipt in browser (inline PDF)
  fastify.get<{ Params: GetOrDeletePurchaseParams }>(
    "/:id/receipt/view",
    {
      preHandler: [rbacMiddleware(["admin", "student"])]
    },
    viewReceipt
  );

  // Generate and download receipt for a purchase
  fastify.get<{ Params: GetOrDeletePurchaseParams }>(
    "/:id/receipt",
    {
      preHandler: [rbacMiddleware(["admin", "student"])]
    },
    generateReceipt
  );

  // Get all purchases for the logged-in user
  fastify.get(
    "/",
    {
      preHandler: [rbacMiddleware(["admin", "student"])]
    },
    getUserPurchases
  );
}
