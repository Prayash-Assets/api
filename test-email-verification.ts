/**
 * Test script for email verification functionality
 * This script demonstrates how to test the email verification endpoints
 */

// Test Registration with Email Verification
const testRegistration = async () => {
  const response = await fetch("http://localhost:3001/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullname: "Test Student",
      email: "test@example.com",
      password: "TestPassword123!",
      userType: "Student",
    }),
  });

  const data = await response.json();
  console.log("Registration Response:", data);

  if (data.requiresVerification) {
    console.log("✅ Registration requires email verification");
    console.log("📧 Check your email for verification code");
  }
};

// Test Email Verification
const testEmailVerification = async (email: string, code: string) => {
  const response = await fetch("http://localhost:3001/api/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      verificationCode: code,
    }),
  });

  const data = await response.json();
  console.log("Verification Response:", data);

  if (data.isVerified) {
    console.log("✅ Email verified successfully");
  }
};

// Test Resend Verification
const testResendVerification = async (email: string) => {
  const response = await fetch(
    "http://localhost:3001/api/auth/resend-verification",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    }
  );

  const data = await response.json();
  console.log("Resend Verification Response:", data);

  if (data.codeSent) {
    console.log("✅ New verification code sent");
  }
};

// Test Login with Unverified Email (should fail)
const testLoginUnverified = async (email: string, password: string) => {
  const response = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();
  console.log("Login Response (Unverified):", data);

  if (data.requiresVerification) {
    console.log("⚠️ Login blocked - email verification required");
  }
};

export {
  testRegistration,
  testEmailVerification,
  testResendVerification,
  testLoginUnverified,
};
