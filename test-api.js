#!/usr/bin/env node

const API_BASE_URL = 'https://iewdmum2s6.execute-api.ap-south-1.amazonaws.com/prod';

async function testAPI() {
  console.log('🚀 Testing Prayash API deployment...\n');

  const tests = [
    {
      name: 'Health Check',
      method: 'GET',
      url: `${API_BASE_URL}/health`,
      expectedStatus: 200
    },
    {
      name: 'Root Endpoint',
      method: 'GET',
      url: `${API_BASE_URL}/`,
      expectedStatus: 200
    },
    {
      name: 'Protected Endpoint (Categories)',
      method: 'GET',
      url: `${API_BASE_URL}/api/categories`,
      expectedStatus: 401,
      expectedMessage: 'No token provided'
    },
    {
      name: 'Login Endpoint',
      method: 'POST',
      url: `${API_BASE_URL}/api/auth/login`,
      body: { email: 'test@example.com', password: 'wrongpassword' },
      expectedStatus: 401,
      expectedMessage: 'Invalid credentials'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      
      const options = {
        method: test.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (test.body) {
        options.body = JSON.stringify(test.body);
      }

      const response = await fetch(test.url, options);
      const data = await response.json();

      if (response.status === test.expectedStatus) {
        if (test.expectedMessage && !JSON.stringify(data).includes(test.expectedMessage)) {
          console.log(`❌ ${test.name}: Expected message "${test.expectedMessage}" not found`);
          console.log(`   Response: ${JSON.stringify(data)}`);
          failed++;
        } else {
          console.log(`✅ ${test.name}: PASSED`);
          passed++;
        }
      } else {
        console.log(`❌ ${test.name}: Expected status ${test.expectedStatus}, got ${response.status}`);
        console.log(`   Response: ${JSON.stringify(data)}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}`);
      failed++;
    }
    console.log('');
  }

  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! API is working correctly.');
    console.log(`\n🌐 API Endpoint: ${API_BASE_URL}`);
    console.log('📋 Available endpoints:');
    console.log('   - GET  /health - Health check');
    console.log('   - GET  / - Root endpoint');
    console.log('   - POST /api/auth/login - User login');
    console.log('   - GET  /api/categories - Categories (requires auth)');
    console.log('   - GET  /api/subjects - Subjects (requires auth)');
    console.log('   - GET  /api/packages - Packages (requires auth)');
    console.log('   - POST /api/webhooks/razorpay - Razorpay webhook');
    console.log('   - And many more...');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the API configuration.');
  }
}

testAPI().catch(console.error);
