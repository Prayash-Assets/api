#!/usr/bin/env node

/**
 * Test script to verify discount calculation fix
 * This script sends an update request to the API and checks if discount is calculated correctly
 */

const http = require('http');

// Package ID from the attachment: 6927ef55d8df667811ed7300
const packageId = '6927ef55d8df667811ed7300';
const baseUrl = 'http://localhost:4000/api';

// The data to send - updating discount
const updateData = {
  discountPercentage: 70,
  price: 11600
};

console.log('\n======================================');
console.log('Testing Discount Calculation Fix');
console.log('======================================\n');

console.log('Package ID:', packageId);
console.log('Sending update with:');
console.log(JSON.stringify(updateData, null, 2));

console.log('\nExpected Result:');
console.log('- originalPrice: 11600');
console.log('- price (discounted): 3480 (11600 * 0.30)');
console.log('- discountPercentage: 70\n');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/packages/${packageId}`,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-token' // Add your token if needed
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    try {
      const result = JSON.parse(data);
      console.log('\nActual Result:');
      console.log('- originalPrice:', result.originalPrice);
      console.log('- price:', result.price);
      console.log('- discountPercentage:', result.discountPercentage);
      
      // Verify calculations
      const expectedDiscountedPrice = 11600 * (1 - 70 / 100);
      console.log('\nValidation:');
      if (result.originalPrice === 11600) {
        console.log('✓ originalPrice is correct');
      } else {
        console.log('✗ originalPrice should be 11600, got', result.originalPrice);
      }
      
      if (result.price === expectedDiscountedPrice) {
        console.log('✓ discounted price is correct');
      } else {
        console.log(`✗ price should be ${expectedDiscountedPrice}, got`, result.price);
      }
      
      if (result.discountPercentage === 70) {
        console.log('✓ discountPercentage is correct');
      } else {
        console.log('✗ discountPercentage should be 70, got', result.discountPercentage);
      }
    } catch (e) {
      console.log('Full Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  console.log('\nMake sure:');
  console.log('1. API server is running on http://localhost:4000');
  console.log('2. MongoDB is connected');
  console.log('3. You have permission to update this package');
});

const body = JSON.stringify(updateData);
req.write(body);
req.end();
