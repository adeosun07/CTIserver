# CTI Server - Complete Local Testing Guide

This guide walks you through testing the CTI server locally with Postman. Updated for the fixed API key authentication using bcrypt hashing.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 0: Environment & Database Setup](#phase-0-environment--database-setup)
3. [Phase 1: Server Startup](#phase-1-server-startup)
4. [Phase 2: Postman Environment Setup](#phase-2-postman-environment-setup)
5. [Phase 3: Create Test Requests](#phase-3-create-test-requests)
6. [Phase 4: Execute Tests in Order](#phase-4-execute-tests-in-order)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** (v18+) - Run `node --version`
- **PostgreSQL** (running on `localhost:5432`) - Check with `psql --version`
- **PgAdmin** (optional but recommended) - For database inspection
- **Postman** (or curl/Thunder Client)
- **ngrok** (optional, for webhook testing via public URL)

### Project Dependencies

```bash
cd C:\Users\USER\Desktop\CTIserver
npm install
```

### Environment File (.env)

Your `.env` file is already configured:

```
PORT=4000
DB_HOST=localhost
DB_PORT=5432  # <-- Make sure this matches your PostgreSQL port (default is 5432, NOT 5000)
DB_USER=postgres
DB_PASSWORD=Aramide_02
DB_NAME=CTI
DIALPAD_WEBHOOK_SECRET=5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5
INTERNAL_API_SECRET=f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5nshdghjkshasdmzhschgs
```

⚠️ **CRITICAL**: Double-check `DB_PORT` - if PostgreSQL is on the default port 5432, update `.env`:

```
DB_PORT=5432
```

---

## Phase 0: Environment & Database Setup

### Step 0.1: Verify PostgreSQL Connection

Open Command Prompt and test the connection:

```bash
psql -h localhost -U postgres -d CTI
```

If this fails:

- PostgreSQL may not be running - start the PostgreSQL service
- Port may be wrong - check your PostgreSQL installation: `psql --version` and adjust `.env`

### Step 0.2: Check Database Schema

If your CTI database doesn't have the required tables, run the migrations:

```bash
# Navigate to your project
cd C:\Users\USER\Desktop\CTIserver

# Connect to PostgreSQL and run schema
psql -h localhost -U postgres -d CTI -f db_schema.txt
```

**Key tables that must exist:**

- `apps` - Your test applications
- `dialpad_connections` - OAuth token storage
- `calls` - Call records
- `webhook_events` - Webhook audit log
- `api_key_audit_log` - API key operation history

### Step 0.3: Create a Test Application

Open PgAdmin or psql and run:

```sql
INSERT INTO apps (id, name, is_active, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Postman Test App',
  true,
  NOW(),
  NOW()
);
```

✅ You'll use `550e8400-e29b-41d4-a716-446655440000` as your test app ID in all requests.

---

## Phase 1: Server Startup

### Step 1.1: Start the CTI Server

Open a terminal in your project directory:

```bash
cd C:\Users\USER\Desktop\CTIserver
npm start
```

**Expected output:**

```
✓ All required environment variables configured
Server running on http://localhost:4000
✓ Database connection successful
WebSocket server initialized
```

**If it fails:**

- Check `.env` variables (especially `DB_PORT`)
- Verify PostgreSQL is running
- Check for port conflicts on 4000

### Step 1.2: Verify Health Check

In another terminal, test the health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-29T..."
}
```

---

## Phase 2: Postman Environment Setup

### Step 2.1: Create Environment Variables

In Postman:

1. Click the **Settings** icon (⚙️) → **Environments**
2. Click **Create New**
3. Name it: `CTI Local`
4. Add these variables:

| Variable         | Initial Value                                                                         | Current Value         | Description                          |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------- | ------------------------------------ |
| `baseUrl`        | http://localhost:4000                                                                 | http://localhost:4000 | Server base URL                      |
| `internalSecret` | f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5nshdghjkshasdmzhschgs | (same)                | INTERNAL_API_SECRET from .env        |
| `webhookSecret`  | 5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5                     | (same)                | DIALPAD_WEBHOOK_SECRET from .env     |
| `appId`          | 550e8400-e29b-41d4-a716-446655440000                                                  | (same)                | Test app UUID                        |
| `apiKey`         | (empty)                                                                               | (empty)               | Auto-filled after API key generation |

5. Click **Save**
6. Select this environment from the top-right dropdown

---

## Phase 3: Create Test Requests

### Step 3.1: Health Check

**Method:** GET  
**URL:** `{{baseUrl}}/health`  
**Auth:** None  
**Body:** None

**Expected Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

---

### Step 3.2: Generate API Key (MUST RUN FIRST)

**Method:** POST  
**URL:** `{{baseUrl}}/internal/apps/{{appId}}/api-key`

**Auth:** Bearer Token

- Token: `{{internalSecret}}`

**Body:** None

**Pre-request Script:** None

**Tests (Script Tab):**

```javascript
// Save API key to environment for subsequent requests
var jsonData = pm.response.json();
if (jsonData.api_key) {
  pm.environment.set("apiKey", jsonData.api_key);
  console.log(
    "✓ API Key saved to environment: " +
      jsonData.api_key.substring(0, 12) +
      "...",
  );
} else if (pm.response.code === 404) {
  console.error("❌ App not found - verify app ID in database");
} else if (pm.response.code === 401) {
  console.error("❌ Unauthorized - check INTERNAL_API_SECRET");
} else {
  console.error("❌ Unexpected response: " + pm.response.code);
}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "message": "API key created successfully. Store this securely - it CANNOT be retrieved again.",
  "api_key": "raw_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "Postman Test App",
  "generated_at": "2026-01-29T12:00:00.000Z",
  "warning": "This is the ONLY time this key will be displayed. Store it immediately in a secure location.",
  "usage": "Include this key in the 'x-app-api-key' header when making API requests"
}
```

⚠️ **IMPORTANT:** The key is stored as a **bcrypt hash** in the database. The plain key is shown only once.

---

### Step 3.3: Check API Key Status

**Method:** GET  
**URL:** `{{baseUrl}}/internal/apps/{{appId}}/api-key/status`

**Auth:** Bearer Token

- Token: `{{internalSecret}}`

**Expected Response (200 OK):**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "Postman Test App",
  "has_active_key": true,
  "key_hint": "raw_abcd...6789",
  "last_rotated": "2026-01-29T12:00:00.000Z",
  "action_needed": null
}
```

---

### Step 3.4: Create User Mapping (Optional)

This maps a Dialpad user to a CRM user for context in calls.

**Method:** POST  
**URL:** `{{baseUrl}}/internal/apps/{{appId}}/users/map`

**Auth:** Bearer Token

- Token: `{{internalSecret}}`

**Body (JSON):**

```json
{
  "dialpad_user_id": 12345,  
  "crm_user_id": "crm_user_001"
}
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "message": "User mapping created",
  "mapping": {
    "dialpad_user_id": 12345,
    "crm_user_id": "crm_user_001"
  }
}
```

---

### Step 3.5: Simulate Dialpad Webhook (Call Event)

This tests the webhook signature verification with the fixed API key authentication.

**Method:** POST  
**URL:** `{{baseUrl}}/webhooks/dialpad`

**Headers:**

- Key: `x-dialpad-signature`
- Value: `{{signature}}`
- Key: `x-app-api-key`
- Value: `{{apiKey}}`

**Body (JSON):**

```json
{
  "event_type": "call.ring",
  "call": {
    "id": 999999,
    "direction": "inbound",
    "from": "+15550001111",
    "to": "+15550002222",
    "status": "ringing",
    "target": {
      "id": 12345,
      "type": "user"
    },
    "event_timestamp": 1678900000000
  },
  "event_timestamp": 1678900000000
}
```

**Pre-request Script:**

```javascript
const secret = pm.environment.get("webhookSecret");
const requestBody = pm.request.body.raw;

// Generate HMAC-SHA256 signature
const signature = CryptoJS.HmacSHA256(requestBody, secret).toString(
  CryptoJS.enc.Base64,
);

pm.variables.set("signature", signature);
console.log("✓ Generated signature: " + signature.substring(0, 20) + "...");
```

**Expected Response (200 OK):**

```json
{
  "received": true
}
```

**Verify in Database:**

```sql
SELECT id, dialpad_call_id, status, from_number, to_number, created_at
FROM calls
WHERE dialpad_call_id = 999999
AND app_id = '550e8400-e29b-41d4-a716-446655440000'
LIMIT 1;
```

---

### Step 3.6: Get Active Calls

**Method:** GET  
**URL:** `{{baseUrl}}/api/calls/active`

**Headers:**

- Key: `x-app-api-key`
- Value: `{{apiKey}}`

**Auth:** None (API key in header instead)

**Body:** None

**Expected Response (200 OK):**

```json
{
  "success": true,
  "calls": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "dialpad_call_id": 999999,
      "direction": "inbound",
      "from_number": "+15550001111",
      "to_number": "+15550002222",
      "status": "ringing",
      "started_at": "2026-01-29T12:00:00.000Z",
      "user_id": "crm_user_001"
    }
  ]
}
```

⚠️ **Note:** The `apiKey` is verified against the bcrypt hash using `validateApiKey()` in the fixed middleware.

---

## Phase 4: Execute Tests in Order

### Execution Checklist

| #   | Request              | Expected Status | Purpose                             |
| --- | -------------------- | --------------- | ----------------------------------- |
| 1   | Health Check         | 200             | Verify server is running            |
| 2   | Generate API Key     | 200             | Create key for subsequent API calls |
| 3   | Check Key Status     | 200             | Verify key was created and stored   |
| 4   | Create User Mapping  | 200             | Map Dialpad user to CRM user        |
| 5   | Webhook (Call Event) | 200             | Simulate incoming call via webhook  |
| 6   | Get Active Calls     | 200             | Verify call appears in API response |

### Step-by-Step Execution

1. **Health Check**
   - Click "Send"
   - Verify `status: "healthy"`

2. **Generate API Key**
   - Click "Send"
   - Check Postman environment (eye icon) - `apiKey` should now be populated
   - Save the key somewhere secure (it won't be retrievable again)

3. **Check API Key Status**
   - Click "Send"
   - Verify `has_active_key: true`

4. **Create User Mapping**
   - Click "Send"
   - Verify success response

5. **Webhook**

- Click "Send"
- Verify `received: true`
- Wait ~5 seconds for the event processor to pick up the event
- Open PgAdmin/psql and run the SQL query from Step 3.5
- Confirm call record exists with `dialpad_call_id = 999999`

6. **Get Active Calls**
   - Click "Send"
   - Verify the call from webhook appears in response
   - Check that `user_id` is `crm_user_001` (from user mapping)

---

## Troubleshooting

### Issue: Cannot Connect to Database

**Problem:** `Error: getaddrinfo ENOTFOUND localhost`

**Solutions:**

1. Verify PostgreSQL is running
2. Check DB_PORT in .env (should be 5432 by default, not 5000)
3. Verify credentials in .env match your PostgreSQL user

```bash
# Test connection manually
psql -h localhost -U postgres -d CTI
```

---

### Issue: "App not found" (404)

**Problem:** API returns 404 when generating API key

**Causes:**

1. App not inserted in database
2. Wrong app_id in Postman environment

**Solution:**

```sql
-- Verify app exists
SELECT id, name, is_active FROM apps WHERE id = '550e8400-e29b-41d4-a716-446655440000';

-- If not found, insert it
INSERT INTO apps (id, name, is_active, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Postman Test App',
  true,
  NOW(),
  NOW()
);
```

---

### Issue: "Unauthorized" (401) - API Key Generation

**Problem:** API returns 401 when generating API key

**Cause:** INTERNAL_API_SECRET doesn't match .env value

**Solution:**

1. Open `.env` and copy `INTERNAL_API_SECRET` exactly
2. In Postman, set `internalSecret` environment variable to that value
3. Verify header is set to `Authorization: Bearer {{internalSecret}}`

---

### Issue: "Unauthorized" (401) - Get Active Calls

**Problem:** API returns 401 when calling `/api/calls/active`

**Cause:** API key not authenticated (bcrypt hash mismatch)

**Likely causes:**

1. `apiKey` environment variable is empty - re-run API key generation step
2. Copy/paste error when generating key - key must match exactly as returned
3. Database was reset - need to generate new key

**Solution:**

1. Re-run "Generate API Key" request
2. Verify `apiKey` is populated in environment (check eye icon)
3. Verify header is exactly `x-app-api-key: {{apiKey}}`

---

### Issue: "Invalid webhook signature" (401)

**Problem:** Webhook returns 401 with invalid signature error

**Causes:**

1. Pre-request script not running - signature not generated
2. `webhookSecret` environment variable wrong
3. Request body changed after script ran

**Solution:**

1. Verify Pre-request Script tab has the CryptoJS code
2. Verify `webhookSecret` matches `DIALPAD_WEBHOOK_SECRET` in .env exactly
3. Don't modify body after pre-request script runs

---

### Issue: Call Not Appearing in Database

**Problem:** Webhook returns 200, but no call record in database

**Causes:**

1. `event_type` missing or not one of `call.started`, `call.ring`, `call.ended`
2. `x-app-api-key` header missing (and no `dialpad_org_id` mapping)
3. Event processor hasn’t run yet (polls every 5 seconds)

**Debugging:**

```sql
-- Check if webhook was received
SELECT id, dialpad_call_id, app_id, payload, received_at
FROM webhook_events
ORDER BY received_at DESC
LIMIT 5;

-- Check if app exists
SELECT id, name FROM apps;
```

---

### Issue: "Missing required environment variables" Error on Startup

**Problem:** Server won't start, complains about missing env vars

**Required variables:**

```
DIALPAD_WEBHOOK_SECRET
CLIENT_ID
CLIENT_SECRET
REDIRECT_URI
DB_USER
DB_PASSWORD
DB_NAME
INTERNAL_API_SECRET
```

**Solution:**

1. Open `.env`
2. Verify all above variables have values
3. Restart server: `npm start`

---

## Advanced Testing: Using ngrok for Webhook Testing

If you want to test webhooks from the actual Dialpad API (not just simulation):

1. **Start ngrok:**

```bash
ngrok http --domain=https://neutral-wasp-calm.ngrok-free.app 4000
```

2. **Update your Dialpad webhook URL:**
   - Go to Dialpad settings
   - Set webhook endpoint to: `https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad`
   - Set signature secret to your `DIALPAD_WEBHOOK_SECRET`

3. **Monitor ngrok traffic:**
   - ngrok shows all incoming requests in the terminal
   - Great for debugging malformed payloads

---

## Summary of Key Changes

This testing guide incorporates the **API key authentication fix**:

| Before                          | After                                         |
| ------------------------------- | --------------------------------------------- |
| API keys stored as plain text   | API keys hashed with bcrypt (cost 10)         |
| Direct string comparison in DB  | Uses `validateApiKey()` with bcrypt.compare() |
| Keys retrievable from database  | Keys one-time only, not recoverable           |
| Vulnerable to database breaches | Cryptographically secure                      |

**Result:** When you send `x-app-api-key: {{apiKey}}` header, the middleware now:

1. Fetches all active apps from database
2. Compares plain key against each bcrypt hash
3. Matches the request to the correct app
4. Proceeds with request

---

## Next Steps

Once local testing passes:

1. Test with real Dialpad OAuth flow
2. Configure ngrok for public webhook testing
3. Deploy to production (use strong DATABASE encryption at rest)
4. Monitor API key rotation cycles
5. Review audit logs: `SELECT * FROM api_key_audit_log;`

---

**Questions?** Check the test output logs and use the Troubleshooting section above.
