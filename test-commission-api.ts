import axios from 'axios';

async function testCommissionAPI() {
  try {
    console.log('Testing Commission API...\n');
    
    // Test 1: Get all commissions
    console.log('1. GET /api/commissions');
    const response = await axios.get('http://localhost:8000/api/commissions', {
      params: { limit: 10 }
    });
    
    console.log('Status:', response.status);
    console.log('Total commissions:', response.data.pagination?.total || 0);
    console.log('Returned:', response.data.commissions?.length || 0);
    
    if (response.data.commissions && response.data.commissions.length > 0) {
      console.log('\nFirst commission:');
      const c = response.data.commissions[0];
      console.log('  ID:', c.id);
      console.log('  Organization:', c.organization?.name);
      console.log('  Status:', c.status);
      console.log('  Amount:', c.finalAmount);
      console.log('  Period:', c.period.type);
    } else {
      console.log('\n⚠️  No commissions returned');
    }
    
    // Test 2: Get summary
    console.log('\n2. GET /api/commissions/summary');
    const summaryResponse = await axios.get('http://localhost:8000/api/commissions/summary');
    console.log('Summary:', JSON.stringify(summaryResponse.data, null, 2));
    
  } catch (error: any) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testCommissionAPI();
