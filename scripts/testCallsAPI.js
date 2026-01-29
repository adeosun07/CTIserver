/**
 * Test Calls API
 *
 * Quick script to test the Calls API endpoints.
 * Requires an active app with API key in the database.
 *
 * Usage: node scripts/testCallsAPI.js <api-key>
 */

import "dotenv/config";
import pool from "../db.js";

const API_KEY = process.argv[2];
const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

if (!API_KEY) {
  console.error("Usage: node scripts/testCallsAPI.js <api-key>");
  console.error("\nTo get an API key:");
  console.error(
    '  psql -c "SELECT api_key FROM apps WHERE is_active = true LIMIT 1;"',
  );
  process.exit(1);
}

/**
 * Make API request
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n→ ${options.method || "GET"} ${endpoint}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-app-api-key": API_KEY,
        ...options.headers,
      },
    });

    const data = await response.json();

    console.log(`← ${response.status} ${response.statusText}`);
    console.log(JSON.stringify(data, null, 2));

    return { response, data };
  } catch (err) {
    console.error("✗ Request failed:", err.message);
    return { error: err };
  }
}

/**
 * Test suite
 */
async function runTests() {
  console.log("=".repeat(60));
  console.log("Testing Calls API");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 20)}...`);

  // Test 1: List all calls
  console.log("\n" + "-".repeat(60));
  console.log("TEST 1: List all calls (default pagination)");
  console.log("-".repeat(60));
  const { data: list1 } = await request("/api/calls");

  // Test 2: List with filters
  console.log("\n" + "-".repeat(60));
  console.log("TEST 2: List calls with filters");
  console.log("-".repeat(60));
  await request("/api/calls?status=ended&limit=5");

  // Test 3: Get active calls
  console.log("\n" + "-".repeat(60));
  console.log("TEST 3: Get active calls");
  console.log("-".repeat(60));
  const { data: activeList } = await request("/api/calls/active");

  // Test 4: Get specific call (if any exist)
  if (list1?.data?.length > 0) {
    console.log("\n" + "-".repeat(60));
    console.log("TEST 4: Get call by ID");
    console.log("-".repeat(60));
    const callId = list1.data[0].id;
    await request(`/api/calls/${callId}`);
  }

  // Test 5: Filter by direction
  console.log("\n" + "-".repeat(60));
  console.log("TEST 5: Filter by direction");
  console.log("-".repeat(60));
  await request("/api/calls?direction=inbound&limit=3");

  // Test 6: Pagination
  console.log("\n" + "-".repeat(60));
  console.log("TEST 6: Pagination");
  console.log("-".repeat(60));
  await request("/api/calls?limit=2&offset=0");

  // Test 7: Invalid API key
  console.log("\n" + "-".repeat(60));
  console.log("TEST 7: Invalid API key (should fail)");
  console.log("-".repeat(60));
  await request("/api/calls", {
    headers: {
      "x-app-api-key": "invalid-key-123",
    },
  });

  // Test 8: Missing API key
  console.log("\n" + "-".repeat(60));
  console.log("TEST 8: Missing API key (should fail)");
  console.log("-".repeat(60));
  await request("/api/calls", {
    headers: {}, // No API key
  });

  // Test 9: Invalid call ID
  console.log("\n" + "-".repeat(60));
  console.log("TEST 9: Invalid call ID format (should fail)");
  console.log("-".repeat(60));
  await request("/api/calls/invalid-id");

  // Test 10: Non-existent call
  console.log("\n" + "-".repeat(60));
  console.log("TEST 10: Non-existent call (should 404)");
  console.log("-".repeat(60));
  await request("/api/calls/00000000-0000-0000-0000-000000000000");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("All tests completed!");
  console.log("=".repeat(60));

  // Show sample cURL commands
  console.log("\nSample cURL commands:");
  console.log("-".repeat(60));
  console.log(`# List all calls`);
  console.log(`curl -X GET "${BASE_URL}/api/calls" \\`);
  console.log(`  -H "x-app-api-key: ${API_KEY}"`);
  console.log();
  console.log(`# Get active calls`);
  console.log(`curl -X GET "${BASE_URL}/api/calls/active" \\`);
  console.log(`  -H "x-app-api-key: ${API_KEY}"`);
  console.log();
  console.log(`# Filter by status`);
  console.log(`curl -X GET "${BASE_URL}/api/calls?status=ended&limit=10" \\`);
  console.log(`  -H "x-app-api-key: ${API_KEY}"`);
  console.log();

  process.exit(0);
}

// Check if server is running
try {
  const healthCheck = await fetch(`${BASE_URL}/`);
  if (!healthCheck.ok) {
    console.error("Server is not responding. Make sure it's running:");
    console.error("  npm start");
    process.exit(1);
  }
} catch (err) {
  console.error("Cannot connect to server. Make sure it's running:");
  console.error("  npm start");
  process.exit(1);
}

// Run tests
runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
