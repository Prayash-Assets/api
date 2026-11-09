/**
 * Require JWT_SECRET from environment. Never fall back to a hardcoded default.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "your-secret-key") {
    throw new Error(
      "JWT_SECRET environment variable is required and must not use the default placeholder"
    );
  }
  return secret;
}
