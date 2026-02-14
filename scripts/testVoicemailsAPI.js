/**
 * Test Voicemails API
 *
 * Quick script to test the /api/voicemails endpoints.
 * Requires an active app with API key in the database.
 *
 * Usage: node scripts/testVoicemailsAPI.js <api-key>
 */

import "dotenv/config";

const API_KEY = process.argv[2];
const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

if (!API_KEY) {
  console.error("Usage: node scripts/testVoicemailsAPI.js <api-key>");
  console.error("\nTo get an API key:");
  console.error(
    '  psql -c "SELECT api_key FROM apps WHERE is_active = true LIMIT 1;"',
  );
  process.exit(1);
}

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

async function runTests() {
  console.log("=".repeat(60));
  console.log("Testing Voicemails API");
  console.log("=".repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 20)}...`);

  // Test 1: List all voicemails
  console.log("\n" + "-".repeat(60));
  console.log("TEST 1: List all voicemails (default pagination)");
  console.log("-".repeat(60));
  const { data: list1 } = await request("/api/voicemails");

  // Test 2: Pagination
  console.log("\n" + "-".repeat(60));
  console.log("TEST 2: Pagination");
  console.log("-".repeat(60));
  await request("/api/voicemails?limit=2&offset=0");

  // Test 3: Filter by dialpad_user_id (if any exist)
  if (list1?.data?.length > 0 && list1.data[0].dialpad_user_id) {
    console.log("\n" + "-".repeat(60));
    console.log("TEST 3: Filter by dialpad_user_id");
    console.log("-".repeat(60));
    const userId = list1.data[0].dialpad_user_id;
    await request(`/api/voicemails?dialpad_user_id=${userId}&limit=5`);
  }

  // Test 4: Get specific voicemail (if any exist)
  if (list1?.data?.length > 0) {
    console.log("\n" + "-".repeat(60));
    console.log("TEST 4: Get voicemail by ID (includes recording_url)");
    console.log("-".repeat(60));
    const voicemailId = list1.data[0].id;
    await request(`/api/voicemails/${voicemailId}`);
  }

  // Test 5: Invalid voicemail ID
  console.log("\n" + "-".repeat(60));
  console.log("TEST 5: Invalid voicemail ID format (should fail)");
  console.log("-".repeat(60));
  await request("/api/voicemails/invalid-id");

  // Test 6: Non-existent voicemail
  console.log("\n" + "-".repeat(60));
  console.log("TEST 6: Non-existent voicemail (should 404)");
  console.log("-".repeat(60));
  await request("/api/voicemails/00000000-0000-0000-0000-000000000000");

  console.log("\n" + "=".repeat(60));
  console.log("Voicemails API tests completed");
  console.log("=".repeat(60));

  console.log("\nSample cURL commands:");
  console.log("-".repeat(60));
  console.log(`# List all voicemails`);
  console.log(
    `curl -X GET "${BASE_URL}/api/voicemails" \\\n+  -H "x-app-api-key: ${API_KEY}"`,
  );
  console.log();
  console.log(`# Get a specific voicemail (playable recording_url in JSON)`);
  console.log(
    `curl -X GET "${BASE_URL}/api/voicemails/<VOICEMAIL_ID>" \\\n+  -H "x-app-api-key: ${API_KEY}"`,
  );
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
