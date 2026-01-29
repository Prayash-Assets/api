import User from "../models/User";

/**
 * Referral Utility Functions
 * Handles referral code generation, validation, and calculations
 */

// Characters used for referral code generation (uppercase alphanumeric, excluding confusing chars)
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluded: I, O, 0, 1

/**
 * Generate a unique 8-character referral code
 * Retries if code already exists in database
 */
export async function generateReferralCode(): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const code = generateRandomCode(8);

        // Check if code already exists
        const existingUser = await User.findOne({
            referralCode: code,
            userType: "Student"
        });

        if (!existingUser) {
            return code;
        }
    }

    // Fallback: append timestamp suffix for uniqueness
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    return generateRandomCode(4) + timestamp;
}

/**
 * Generate a random code of specified length
 */
function generateRandomCode(length: number): string {
    let code = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * CODE_CHARACTERS.length);
        code += CODE_CHARACTERS[randomIndex];
    }
    return code;
}

/**
 * Validate referral code format
 * Must be 8 characters, alphanumeric
 */
export function validateCodeFormat(code: string): boolean {
    if (!code || typeof code !== "string") {
        return false;
    }

    const normalizedCode = code.trim().toUpperCase();

    // Must be exactly 8 characters
    if (normalizedCode.length !== 8) {
        return false;
    }

    // Must contain only valid characters
    const validPattern = /^[A-Z0-9]+$/;
    return validPattern.test(normalizedCode);
}

/**
 * Normalize referral code (uppercase, trim)
 */
export function normalizeCode(code: string): string {
    return code.trim().toUpperCase();
}

/**
 * Calculate referral discount based on settings
 */
export function calculateReferralDiscount(
    purchaseAmount: number,
    discountType: "percentage" | "flat",
    refereeBenefit: number,
    minPurchaseAmount: number
): {
    isEligible: boolean;
    discountAmount: number;
    reason?: string;
} {
    // Check minimum purchase amount
    if (purchaseAmount < minPurchaseAmount) {
        return {
            isEligible: false,
            discountAmount: 0,
            reason: `Minimum purchase amount of ₹${minPurchaseAmount} required for referral discount`
        };
    }

    let discountAmount: number;

    if (discountType === "percentage") {
        discountAmount = Math.round((purchaseAmount * refereeBenefit) / 100);
    } else {
        // Flat discount
        discountAmount = refereeBenefit;
    }

    // Discount cannot exceed purchase amount
    if (discountAmount >= purchaseAmount) {
        discountAmount = Math.floor(purchaseAmount * 0.9); // Max 90% discount
    }

    return {
        isEligible: true,
        discountAmount
    };
}

/**
 * Calculate referrer credit based on settings
 */
export function calculateReferrerCredit(
    purchaseAmount: number,
    discountType: "percentage" | "flat",
    referrerBenefit: number
): number {
    if (discountType === "percentage") {
        return Math.round((purchaseAmount * referrerBenefit) / 100);
    } else {
        return referrerBenefit;
    }
}

/**
 * Mask referrer name for privacy (show first name and last initial)
 * "John Doe" -> "John D."
 */
export function maskReferrerName(fullname: string): string {
    if (!fullname) return "Unknown";

    const parts = fullname.trim().split(" ");
    if (parts.length === 1) {
        return parts[0];
    }

    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

    return `${firstName} ${lastInitial}.`;
}
