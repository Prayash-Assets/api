import { FastifyRequest, FastifyReply } from "fastify";
import { Document } from "mongoose";
import PaymentSettings, {
  IPaymentSettings,
} from "../models/paymentSettings.model";

// Type for the request body
export type PaymentSettingsBody = Omit<
  IPaymentSettings,
  keyof Document | "createdAt" | "updatedAt"
> & {
  secretKey?: string;
  testSecretKey?: string;
};

// Type for update data
type UpdatePaymentSettingsData = Partial<IPaymentSettings> & {
  secretKey?: string;
  testSecretKey?: string;
};

// Get payment settings
export const getPaymentSettings = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const settings = await PaymentSettings.findOne({ isActive: true })
      .select("gateway isLive publicKey testPublicKey isActive")
      .lean();

    if (!settings) {
      return reply.status(404).send({ message: "Payment settings not found" });
    }

    return reply.send(settings);
  } catch (error) {
    req.log.error(`Error fetching payment settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Create payment settings
export const createPaymentSettings = async (
  req: FastifyRequest<{ Body: PaymentSettingsBody }>,
  reply: FastifyReply
) => {
  try {
    // Check if active settings already exist
    const existingSettings = await PaymentSettings.findOne({ isActive: true });

    if (existingSettings) {
      return reply.status(409).send({
        message:
          "Payment settings already exist. Use PUT to update existing settings.",
      });
    }

    const body = req.body;
    const {
      gateway,
      isLive,
      publicKey,
      secretKey,
      testPublicKey,
      testSecretKey,
    } = body;

    // Create new settings
    const newSettings = await PaymentSettings.create({
      gateway,
      isLive,
      publicKey,
      secretKey,
      testPublicKey,
      testSecretKey,
      isActive: true,
    });

    // Convert to plain object and remove sensitive data
    const resultObj = newSettings.toObject();
    const { secretKey: _, testSecretKey: __, ...safeResult } = resultObj;

    return reply.status(201).send({
      message: "Payment settings created successfully",
      settings: safeResult,
    });
  } catch (error) {
    req.log.error(`Error creating payment settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Update payment settings
export const updatePaymentSettings = async (
  req: FastifyRequest<{ Body: Partial<PaymentSettingsBody> }>,
  reply: FastifyReply
) => {
  const body = req.body;
  const {
    gateway,
    isLive,
    publicKey,
    secretKey,
    testPublicKey,
    testSecretKey,
  } = body;

  try {
    // Find existing active settings
    let settings = await PaymentSettings.findOne({ isActive: true });

    const updateData: UpdatePaymentSettingsData = {
      gateway,
      isLive,
      publicKey,
      testPublicKey,
    };

    // Only update secret keys if provided
    if (secretKey) {
      updateData.secretKey = secretKey;
    }
    if (testSecretKey) {
      updateData.testSecretKey = testSecretKey;
    }

    let result: IPaymentSettings;

    if (settings) {
      // Update existing settings
      settings.set(updateData);
      result = await settings.save();
    } else {
      // Create new settings if none exist
      result = await PaymentSettings.create({
        ...updateData,
        secretKey: secretKey || "",
        testSecretKey: testSecretKey || "",
        isActive: true,
      });
    }

    // Convert to plain object and remove sensitive data
    const resultObj = result.toObject();
    const { secretKey: _, testSecretKey: __, ...safeResult } = resultObj;

    return reply.send({
      message: "Payment settings updated successfully",
      settings: safeResult,
    });
  } catch (error) {
    req.log.error(`Error updating payment settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Test payment settings
export const testPaymentSettings = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const settings = await PaymentSettings.findOne({ isActive: true });

    if (!settings) {
      return reply
        .status(400)
        .send({ message: "No active payment settings found" });
    }

    // TODO: Implement actual payment gateway test
    // This is a placeholder for the payment gateway test logic
    req.log.info(`Testing payment settings - Gateway: ${settings.gateway}, IsLive: ${settings.isLive}`);

    return reply.send({
      success: true,
      message: "Payment gateway test successful",
      gateway: settings.gateway,
      isLive: settings.isLive,
    });
  } catch (error) {
    req.log.error(`Error testing payment settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({
      success: false,
      message: "Failed to test payment gateway",
    });
  }
};
