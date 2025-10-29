// Quick test script to login and test operations endpoints
// Run with: node test-operations.js

// Use built-in fetch (Node 18+)
const BASE_URL = 'http://localhost:4000';

// Test login with admin user
async function login(username, password) {
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Login successful for ${username}`);
    console.log(`Token: ${data.token}`);
    return data.token;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return null;
  }
}

// Test an API endpoint
async function testEndpoint(token, endpoint, description) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ ${description}: OK`);
    return data;
  } catch (error) {
    console.error(`❌ ${description}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🧪 Testing Operations Endpoints\n');

  // Test login
  const token = await login('admin', 'admin');
  if (!token) {
    console.log('Cannot proceed without valid token');
    return;
  }

  console.log('\n📊 Testing Accounting Reports:');
  await testEndpoint(token, '/api/accounts/reports/trial-balance', 'Trial Balance');
  await testEndpoint(token, '/api/accounts/reports/balance-sheet', 'Balance Sheet');
  await testEndpoint(token, '/api/accounts/reports/profit-loss?start_date=2025-10-01&end_date=2025-10-29', 'Profit & Loss');

  console.log('\n⚙️ Testing Operations Endpoints:');
  await testEndpoint(token, '/api/operations/day-end', 'Day End Report');
  await testEndpoint(token, '/api/operations/monthly?month=2025-10', 'Monthly Operations');
  await testEndpoint(token, '/api/purchases?limit=5', 'Purchases List');

  console.log('\n✨ Test complete!');
}

main().catch(console.error);