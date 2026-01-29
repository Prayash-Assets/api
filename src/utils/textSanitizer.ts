/**
 * Utility to fix common text encoding issues
 * This handles cases where special characters were stored with incorrect encoding
 */

// Map of commonly corrupted character sequences to their correct UTF-8 equivalents
const encodingFixMap: Record<string, string> = {
    // Degree symbol variations
    "\u00c2\u00b0": "\u00b0", // UTF-8 degree interpreted as Latin-1 -> degree symbol
    "\ufffd": "\u00b0",      // Replacement character -> degree symbol

    // Common Windows-1252 to UTF-8 misinterpretations
    "\u00e2\u20ac\u2122": "'",    // Right single quote
    "\u00e2\u20ac\u02dc": "'",    // Left single quote  
    "\u00e2\u20ac\u0153": '"',    // Left double quote
    "\u00e2\u20ac\u009d": '"',    // Right double quote
    "\u00e2\u20ac\u201c": "\u2013", // En dash
    "\u00e2\u20ac\u201d": "\u2014", // Em dash

    // French/European characters
    "\u00c3\u00a9": "\u00e9",     // e with acute
    "\u00c3\u00a8": "\u00e8",     // e with grave
    "\u00c3\u00a0": "\u00e0",     // a with grave
    "\u00c3\u00a2": "\u00e2",     // a with circumflex
    "\u00c3\u00ae": "\u00ee",     // i with circumflex
    "\u00c3\u00b4": "\u00f4",     // o with circumflex
    "\u00c3\u00bb": "\u00fb",     // u with circumflex
    "\u00c3\u00a7": "\u00e7",     // c with cedilla
};

/**
 * Sanitizes text by fixing common encoding issues
 * @param text - The text to sanitize
 * @returns Sanitized text with proper encoding
 */
export function sanitizeText(text: string | null | undefined): string {
    if (!text) return text || "";

    let sanitized = text;

    // Apply all encoding fixes
    for (const [corrupted, correct] of Object.entries(encodingFixMap)) {
        sanitized = sanitized.split(corrupted).join(correct);
    }

    // Replace Unicode replacement character with degree symbol (common case)
    sanitized = sanitized.replace(/\uFFFD/g, "\u00b0");

    return sanitized;
}

/**
 * Checks if a value is a plain object (not a special object like Date, RegExp, etc.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    // Plain objects have Object.prototype as their prototype or null
    return proto === Object.prototype || proto === null;
}

/**
 * Recursively sanitizes all string values in an object
 * Only processes plain objects and arrays, preserves other types
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject<T>(obj: T): T {
    // Handle null and undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle strings - sanitize them
    if (typeof obj === "string") {
        return sanitizeText(obj) as T;
    }

    // Handle primitives - return as-is
    if (typeof obj !== "object") {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item)) as T;
    }

    // Only process plain objects, preserve special objects like Date, ObjectId, etc.
    if (!isPlainObject(obj)) {
        return obj;
    }

    // Process plain objects
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized as T;
}
