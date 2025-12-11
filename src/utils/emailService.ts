import nodemailer from "nodemailer";
import EmailSettings from "../models/emailSettings.model";
import logger from "../config/logger";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter | null = null;

  private constructor() { }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async createTransporter(): Promise<nodemailer.Transporter | null> {
    try {
      // Get active email settings
      const emailSettings = await EmailSettings.findOne({
        isActive: true,
      }).select("+smtpPassword");

      if (!emailSettings) {
        logger.error("No active email settings found");
        return null;
      }

      // Configure transporter options based on port and security settings
      let transportOptions: any = {
        host: emailSettings.smtpHost,
        port: emailSettings.smtpPort,
        auth: {
          user: emailSettings.smtpUser,
          pass: emailSettings.smtpPassword,
        },
      };

      // Handle different SMTP configurations
      if (emailSettings.smtpPort === 465) {
        // Port 465 uses implicit SSL
        transportOptions.secure = true;
      } else if (
        emailSettings.smtpPort === 587 ||
        emailSettings.smtpPort === 25
      ) {
        // Port 587 and 25 typically use STARTTLS
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
        transportOptions.tls = {
          ciphers: "SSLv3",
          rejectUnauthorized: false, // Allow self-signed certificates in development
        };
      } else {
        // Use the smtpSecure setting from database for other ports
        transportOptions.secure = emailSettings.smtpSecure;
        if (!emailSettings.smtpSecure) {
          transportOptions.requireTLS = true;
          transportOptions.tls = {
            rejectUnauthorized: false,
          };
        }
      }

      // Add additional security options for common providers
      if (emailSettings.smtpHost.includes("gmail")) {
        transportOptions.service = "gmail";
        transportOptions.tls = {
          rejectUnauthorized: false,
        };
      } else if (
        emailSettings.smtpHost.includes("outlook") ||
        emailSettings.smtpHost.includes("hotmail")
      ) {
        transportOptions.service = "hotmail";
      } else if (emailSettings.smtpHost.includes("yahoo")) {
        transportOptions.service = "yahoo";
      }

      const transporter = nodemailer.createTransport(transportOptions);

      // Verify connection with better error handling
      try {
        await transporter.verify();
        logger.info("Email transporter created and verified successfully", {
          host: emailSettings.smtpHost,
          port: emailSettings.smtpPort,
          secure: transportOptions.secure,
        });
      } catch (verifyError: any) {
        logger.warn(
          "Email transporter verification failed, but transporter created",
          {
            error: verifyError.message,
            host: emailSettings.smtpHost,
            port: emailSettings.smtpPort,
          }
        );
        // Return transporter anyway - verification might fail due to network issues
        // but the transporter might still work for sending emails
      }

      return transporter;
    } catch (error: any) {
      logger.error("Failed to create email transporter", {
        error: error.message,
        stack: error.stack,
      });
      return null;
    }
  }

  public async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (!this.transporter) {
        this.transporter = await this.createTransporter();
      }

      if (!this.transporter) {
        logger.error("Email transporter not available");
        return false;
      }

      const emailSettings = await EmailSettings.findOne({ isActive: true });
      if (!emailSettings) {
        logger.error("No active email settings found for sending email");
        return false;
      }

      const mailOptions = {
        from: `${emailSettings.fromName} <${emailSettings.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info("Email sent successfully", {
        to: options.to,
        subject: options.subject,
        messageId: result.messageId,
      });

      return true;
    } catch (error: any) {
      logger.error("Failed to send email", {
        error: error.message,
        to: options.to,
        subject: options.subject,
      });

      // Reset transporter on error
      this.transporter = null;
      return false;
    }
  }

  public async sendVerificationCode(
    email: string,
    fullname: string,
    verificationCode: string
  ): Promise<boolean> {
    const subject = "Email Verification - Prayash App";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .code { font-size: 24px; font-weight: bold; color: #4CAF50; text-align: center; 
                  padding: 20px; background-color: white; border: 2px dashed #4CAF50; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .warning { color: #ff6b6b; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Prayash App!</h1>
          </div>
          <div class="content">
            <h2>Hello ${fullname},</h2>
            <p>Thank you for registering with Prayash App. To complete your registration, please verify your email address using the verification code below:</p>
            
            <div class="code">${verificationCode}</div>
            
            <p>Please enter this code in the verification page to activate your account.</p>
            
            <p class="warning">⚠️ This code will expire in 10 minutes for security reasons.</p>
            
            <p>If you didn't create an account with us, please ignore this email.</p>
            
            <p>Best regards,<br>The Prayash App Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Welcome to Prayash App!
      
      Hello ${fullname},
      
      Thank you for registering with Prayash App. To complete your registration, please verify your email address using the verification code below:
      
      Verification Code: ${verificationCode}
      
      Please enter this code in the verification page to activate your account.
      
      ⚠️ This code will expire in 10 minutes for security reasons.
      
      If you didn't create an account with us, please ignore this email.
      
      Best regards,
      The Prayash App Team
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  public async sendPasswordResetEmail(
    email: string,
    fullname: string,
    resetCode: string
  ): Promise<boolean> {
    const subject = "Password Reset Code - Prayash App";
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .code { font-size: 24px; font-weight: bold; color: #3B82F6; text-align: center; 
                  padding: 20px; background-color: white; border: 2px dashed #3B82F6; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .warning { color: #ff6b6b; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hello ${fullname},</h2>
            <p>We received a request to reset your password for your Prayash App account.</p>
            
            <p>Use the following 6-digit code to reset your password:</p>
            
            <div class="code">${resetCode}</div>
            
            <p class="warning">⚠️ This code will expire in 10 minutes.</p>
            
            <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            
            <p>Best regards,<br>The Prayash App Team</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Password Reset Request
      
      Hello ${fullname},
      
      We received a request to reset your password for your Prayash App account.
      
      Use the following 6-digit code to reset your password:
      
      Code: ${resetCode}
      
      ⚠️ This code will expire in 10 minutes.
      
      If you didn't request a password reset, please ignore this email.
      
      Best regards,
      The Prayash App Team
    `;

    return await this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }
}

export default EmailService.getInstance();
