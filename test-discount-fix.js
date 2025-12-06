const mongoose = require('mongoose');
const packageSchema = require('./src/models/Package').default;

// Test case: package with discount
const testPackage = {
  name: "Test Package",
  price: 11600,
  discountPercentage: 70,
  duration: 30,
  mockTests: [],
  publicView: true
};

console.log("Test Input:");
console.log(JSON.stringify(testPackage, null, 2));

// Expected calculation:
// Original Price: 11600
// Discount: 70%
// Discounted Price: 11600 * (1 - 70/100) = 11600 * 0.3 = 3480
console.log("\nExpected Output:");
console.log("originalPrice: 11600");
console.log("price (discounted): 3480");
console.log("discountPercentage: 70");
