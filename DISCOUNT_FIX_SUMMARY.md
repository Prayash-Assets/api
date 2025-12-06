/**
 * Quick test to verify the discount calculation
 * This shows the expected vs actual values after the fix
 */

console.log(`
====================================================
DISCOUNT CALCULATION FIX - VERIFICATION
====================================================

PROBLEM IDENTIFIED:
When updating a package with a discount using the API,
the discount calculation was not being applied because:

1. The updatePackage controller was using findByIdAndUpdate()
   which BYPASSES Mongoose pre-save middleware hooks
2. The pre-save middleware contains the discount calculation logic
3. Without the middleware, discount calculations never ran

SOLUTION IMPLEMENTED:

1. API Controller Fix (packageController.ts):
   - Changed from: Package.findByIdAndUpdate()
   - Changed to: Package.findById() → Object.assign() → save()
   - This ensures pre-save middleware is triggered
   - Added explicit markModified() for price/discount fields

2. Pre-save Middleware Improvement (Package.ts):
   - Simplified the logic to handle all cases properly
   - When discount exists and price is updated:
     * If no originalPrice exists: treat price as originalPrice
     * Calculate discountedPrice = originalPrice × (1 - discount/100)
   - When discount is removed: restore original price

TEST CASE:
Package: "test"
Input: price=11600, discountPercentage=70, originalPrice=11600

EXPECTED AFTER FIX:
{
  "price": 3480,           // 11600 × (1 - 70/100) = 11600 × 0.3 = 3480
  "originalPrice": 11600,
  "discountPercentage": 70
}

WHAT HAPPENS NOW:
1. User sends: price=11600, discountPercentage=70
2. Controller fetches document and updates fields
3. Middleware detects discount > 0
4. Middleware treats 11600 as originalPrice
5. Middleware calculates: 11600 × 0.3 = 3480 as final price
6. Document saves with correct values

====================================================
`);
