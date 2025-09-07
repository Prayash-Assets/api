/**
 * Email Configuration Diagnostic Tool
 * This helper function analyzes SMTP settings and provides recommendations
 */

export const diagnoseEmailSettings = (emailSettings: any) => {
  const diagnostics = {
    recommendations: [] as string[],
    warnings: [] as string[],
    portInfo: "",
  };

  // Port-specific recommendations
  switch (emailSettings.smtpPort) {
    case 25:
      diagnostics.portInfo =
        "Port 25: Standard SMTP port, often blocked by ISPs";
      diagnostics.recommendations.push(
        "Consider using port 587 for better deliverability"
      );
      break;
    case 465:
      diagnostics.portInfo = "Port 465: SMTP over SSL (implicit TLS)";
      diagnostics.recommendations.push(
        "Ensure SSL/TLS is enabled for port 465"
      );
      break;
    case 587:
      diagnostics.portInfo = "Port 587: SMTP submission port with STARTTLS";
      diagnostics.recommendations.push("Use STARTTLS (not SSL) for port 587");
      break;
    default:
      diagnostics.portInfo = `Port ${emailSettings.smtpPort}: Custom port`;
      diagnostics.warnings.push("Using non-standard SMTP port");
  }

  // Provider-specific recommendations
  const host = emailSettings.smtpHost?.toLowerCase() || "";

  if (host.includes("gmail")) {
    diagnostics.recommendations.push("Gmail: Use port 587 with STARTTLS");
    diagnostics.recommendations.push(
      'Gmail: Enable "Less secure app access" or use App Passwords'
    );
  } else if (host.includes("outlook") || host.includes("hotmail")) {
    diagnostics.recommendations.push("Outlook: Use port 587 with STARTTLS");
  } else if (host.includes("yahoo")) {
    diagnostics.recommendations.push("Yahoo: Use port 587 or 465 with SSL/TLS");
  }

  // Security recommendations
  if (emailSettings.smtpPort === 465 && !emailSettings.smtpSecure) {
    diagnostics.warnings.push("Port 465 requires SSL to be enabled");
  }

  if (emailSettings.smtpPort === 587 && emailSettings.smtpSecure) {
    diagnostics.warnings.push("Port 587 typically uses STARTTLS, not SSL");
  }

  return diagnostics;
};

/**
 * Test email settings with detailed error reporting
 */
export const testEmailConfiguration = async (emailSettings: any) => {
  const nodemailer = require("nodemailer");

  try {
    let transportOptions: any = {
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPassword,
      },
    };

    // Apply the same logic as the main email service
    if (emailSettings.smtpPort === 465) {
      transportOptions.secure = true;
    } else if (
      emailSettings.smtpPort === 587 ||
      emailSettings.smtpPort === 25
    ) {
      transportOptions.secure = false;
      transportOptions.requireTLS = true;
      transportOptions.tls = {
        rejectUnauthorized: false,
      };
    } else {
      transportOptions.secure = emailSettings.smtpSecure;
      if (!emailSettings.smtpSecure) {
        transportOptions.requireTLS = true;
        transportOptions.tls = {
          rejectUnauthorized: false,
        };
      }
    }

    const transporter = nodemailer.createTransport(transportOptions);
    await transporter.verify();

    return {
      success: true,
      message: "Email configuration is valid and working",
      diagnostics: diagnoseEmailSettings(emailSettings),
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Email configuration test failed: ${error.message}`,
      diagnostics: diagnoseEmailSettings(emailSettings),
      error: {
        code: error.code,
        command: error.command,
        response: error.response,
      },
    };
  }
};
