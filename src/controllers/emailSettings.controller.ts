import { FastifyRequest, FastifyReply } from "fastify";
import { Document } from "mongoose";
import EmailSettings, { IEmailSettings } from "../models/emailSettings.model";
import { testEmailConfiguration } from "../utils/emailDiagnostics";

// Type for the request body
export type EmailSettingsBody = Omit<
  IEmailSettings,
  keyof Document | "createdAt" | "updatedAt"
> & {
  smtpPassword?: string;
};

// Type for update data
type UpdateEmailSettingsData = Partial<IEmailSettings> & {
  smtpPassword?: string;
};

// Get email settings
export const getEmailSettings = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const settings = await EmailSettings.findOne({ isActive: true })
      .select("-__v -createdAt -updatedAt -smtpPassword")
      .lean();

    if (!settings) {
      return reply.status(404).send({ message: "Email settings not found" });
    }

    return reply.send(settings);
  } catch (error) {
    req.log.error(`Error fetching email settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Create email settings
export const createEmailSettings = async (
  req: FastifyRequest<{ Body: EmailSettingsBody }>,
  reply: FastifyReply
) => {
  try {
    // Check if active settings already exist
    const existingSettings = await EmailSettings.findOne({ isActive: true });

    if (existingSettings) {
      return reply.status(409).send({
        message:
          "Email settings already exist. Use PUT to update existing settings.",
      });
    }

    const body = req.body;
    const {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpSecure,
      fromEmail,
      fromName,
    } = body;

    // Create new settings
    const newSettings = await EmailSettings.create({
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpSecure,
      fromEmail,
      fromName,
      isActive: true,
    });

    // Convert to plain object and remove sensitive data
    const resultObj = newSettings.toObject();
    const { smtpPassword: _, ...safeResult } = resultObj;

    return reply.status(201).send({
      message: "Email settings created successfully",
      settings: safeResult,
    });
  } catch (error) {
    req.log.error(`Error creating email settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Update email settings
export const updateEmailSettings = async (
  req: FastifyRequest<{ Body: Partial<EmailSettingsBody> }>,
  reply: FastifyReply
) => {
  const body = req.body as EmailSettingsBody;
  const {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    smtpSecure,
    fromEmail,
    fromName,
  } = body;

  try {
    // Find existing active settings
    let settings = await EmailSettings.findOne({ isActive: true });

    const updateData: UpdateEmailSettingsData = {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpSecure,
      fromEmail,
      fromName,
    };

    // Only update password if provided
    if (smtpPassword) {
      updateData.smtpPassword = smtpPassword;
    }

    let result: IEmailSettings;

    if (settings) {
      // Update existing settings
      settings.set(updateData);
      result = await settings.save();
    } else {
      // Create new settings if none exist
      result = await EmailSettings.create({
        ...updateData,
        smtpPassword: smtpPassword || "", // Empty string as fallback
        isActive: true,
      });
    }

    // Convert to plain object and remove sensitive data
    const resultObj = result.toObject();
    const { smtpPassword: _, ...safeResult } = resultObj;

    return reply.send({
      message: "Email settings updated successfully",
      settings: safeResult,
    });
  } catch (error) {
    req.log.error(`Error updating email settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({ message: "Server error" });
  }
};

// Test email settings with detailed diagnostics
export const testEmailSettings = async (
  req: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const settings = await EmailSettings.findOne({ isActive: true }).select(
      "+smtpPassword"
    );

    if (!settings) {
      return reply
        .status(400)
        .send({ message: "No active email settings found" });
    }

    // Test the configuration with detailed error reporting
    const testResult = await testEmailConfiguration({
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      smtpPassword: settings.smtpPassword,
      smtpSecure: settings.smtpSecure,
    });

    req.log.info(`Email settings test completed - Success: ${testResult.success}, Host: ${settings.smtpHost}, Port: ${settings.smtpPort}`);

    if (testResult.success) {
      return reply.send({
        success: true,
        message: testResult.message,
        diagnostics: testResult.diagnostics,
      });
    } else {
      return reply.status(400).send({
        success: false,
        message: testResult.message,
        diagnostics: testResult.diagnostics,
        error: testResult.error,
        suggestions: [
          "Check your SMTP credentials",
          "Verify the SMTP host and port",
          "Ensure your email provider allows SMTP access",
          "For Gmail, use App Passwords instead of regular passwords",
          "Check if your firewall is blocking the SMTP port",
        ],
      });
    }
  } catch (error) {
    req.log.error(`Error testing email settings: ${error instanceof Error ? error.message : String(error)}`);
    return reply.status(500).send({
      success: false,
      message: "Failed to test email settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
