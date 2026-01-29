# API Key Flow Documentation - Production Guide

## Table of Contents

1. [Overview](#overview)
2. [Where API Keys Come From](#where-api-keys-come-from)
3. [The 3 Main Flows](#the-3-main-flows)
4. [Production Setup](#production-setup)
5. [Security Best Practices](#security-best-practices)

---

## Overview

Your CTI backend has **3 completely separate authentication systems**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR CTI BACKEND                             │
│                   (Node.js + PostgreSQL)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓

    FLOW 1               FLOW 2                FLOW 3
    ──────               ──────                ──────
Dialpad OAuth       Dialpad Webhooks      Base44 API
(Authentication)    (Event Ingestion)     (Reads Calls)
```

---

## Where API Keys Come From

### The `apps` Table Structure

```sql
CREATE TABLE apps (
  id UUID PRIMARY KEY,          -- Your tenant ID
  name TEXT,                    -- App name (e.g., "Acme Corp CRM")
  api_key TEXT UNIQUE,          -- Generated API key for Base44
  is_active BOOLEAN,            -- Enable/disable access
  created_at TIMESTAMP
);
```

### When API Keys Are Created

**You create apps manually in your database:**

```sql
-- Create a new app
INSERT INTO apps (name, api_key, is_active) VALUES (
  'Base44 CRM',
  'app_' || substr(md5(random()::text), 0, 25),  -- Auto-generate
  true
);

-- Retrieve it
SELECT id, api_key FROM apps WHERE name = 'Base44 CRM';
```

**Result:**

```
                 id                  |              api_key
──────────────────────────────────────┼─────────────────────────────
 550e8400-e29b-41d4-a716-446655440000 | app_a1b2c3d4e5f6g7h8i9j0k1l2
```

---

## The 3 Main Flows

### FLOW 1: Dialpad OAuth (App Authorization)

**Timeline: ONE TIME - When setting up your integration**

```
┌─────────────┐       ┌─────────────────────┐       ┌─────────────┐
│   Base44    │       │   CTI Backend       │       │   Dialpad   │
│   (Admin)   │       │  (Your Server)      │       │  (OAuth)    │
└─────────────┘       └─────────────────────┘       └─────────────┘
       │                      │                            │
       │  1. Click "Connect   │                            │
       │     Dialpad" button  │                            │
       └─────────────────────>│                            │
                              │                            │
                              │  2. Redirect to Dialpad    │
                              │     /oauth/authorize       │
                              └───────────────────────────>│
                                                           │
                                    3. User logs in &
                                       grants permission
                                                           │
                              4. Redirect back with code  │
                              /<──────────────────────────┘
                              │
                              │  5. Exchange code for
                              │     access_token (BACKEND)
                              │──────────────────────────>│
                                                          │
                                    6. Return access_token
                                    <──────────────────────
                              │
                              │  7. Save to dialpad_connections
                              │     table with app_id
```

**Relevant Files:**

- `controllers/dialpadAuthController.js` → `connect()` and `callback()`
- Database: `dialpad_connections` table stores tokens per app_id

**NO API KEY USED HERE** - Uses Dialpad OAuth2 flow instead

---

### FLOW 2: Dialpad Webhooks (Event Ingestion)

**Timeline: CONTINUOUS - When webhooks are received**

```
┌─────────────┐       ┌─────────────────────┐       ┌─────────────┐
│   Dialpad   │       │   CTI Backend       │       │   Database  │
│  (Webhooks) │       │  (Your Server)      │       │  (Postgres) │
└─────────────┘       └─────────────────────┘       └─────────────┘
       │                      │                            │
       │  1. Call happens     │                            │
       │  in Dialpad          │                            │
       │                      │                            │
       │  2. Send webhook to  │                            │
       │     /webhooks/dialpad│                            │
       │  Headers:            │                            │
       │  - x-dialpad-sig...  │                            │
       │  - x-app-api-key     │                            │
       │  Body: call event    │                            │
       └─────────────────────>│                            │
                              │                            │
                              │  3. Verify webhook sig    │
                              │     (DIALPAD_WEBHOOK_SECRET)
                              │                            │
                              │  4. Extract app_id from   │
                              │     x-app-api-key or      │
                              │     dialpad_org_id        │
                              │                            │
                              │  5. INSERT into           │
                              │     webhook_events        │
                              └───────────────────────────>│
                              │                            │
                              │  6. Return 200 OK         │
                              │  (webhook processed)      │
                              │
                              │  7. Background processor  │
                              │     reads webhook_events  │
                              │     and updates calls table
```

**API Key Used:** `x-app-api-key` header (optional, for routing)

**Relevant Files:**

- `controllers/webhookController.js` → `handleDialpadWebhook()`
- `services/dialpadEventProcessor.js` → event processing
- Database: `webhook_events` and `calls` tables

**Key Point:** Webhooks come FROM Dialpad, not from Base44

---

### FLOW 3: Base44 Reads Calls via API

**Timeline: ON-DEMAND - When Base44 needs call data**

```
┌─────────────┐       ┌─────────────────────┐       ┌─────────────┐
│   Base44    │       │   CTI Backend       │       │   Database  │
│ (Frontend)  │       │  (Your Server)      │       │  (Postgres) │
└─────────────┘       └─────────────────────┘       └─────────────┘
       │                      │                            │
       │  1. User opens       │                            │
       │     "Active Calls"   │                            │
       │     dashboard        │                            │
       │                      │                            │
       │  2. fetch('/api/calls/active')  │                │
       │  Headers:                                         │
       │  - x-app-api-key: app_a1b2c3... │                │
       │  (API key stored in Base44 env)                  │
       │────────────────────>│                            │
                              │                            │
                              │  3. apiKeyAuth middleware  │
                              │     validates API key      │
                              │     → looks up in apps     │
                              │────────────────────────────>│
                              │  ✓ Found, get app_id       │
                              │  <─────────────────────────
                              │                            │
                              │  4. callsController.list() │
                              │     calls callsService     │
                              │                            │
                              │  5. SQL query:             │
                              │     SELECT * FROM calls    │
                              │     WHERE app_id = $1      │
                              │────────────────────────────>│
                              │  Tenant isolation!         │
                              │  <─────────────────────────
                              │                            │
       │  6. Response:        │                            │
       │  {                   │                            │
       │    calls: [...],     │                            │
       │    pagination: {...} │                            │
       │  }                   │                            │
       │<────────────────────┤                            │
       │                      │
       │  7. Render live      │
       │     call dashboard
```

**API Key Used:** `x-app-api-key` header (sent by Base44)

**Relevant Files:**

- `routes/calls.js` → API routes
- `middleware/apiKeyAuth.js` → validates key
- `controllers/callsController.js` → API endpoint handlers
- `services/callsService.js` → query logic
- Database: `apps` and `calls` tables

---

## Production Setup

### Step 1: Create Your App(s)

**In Production PostgreSQL:**

```sql
-- For your Base44 CRM integration
INSERT INTO apps (name, api_key, is_active)
VALUES (
  'Base44 CRM',
  'app_' || substr(encode(gen_random_bytes(32), 'hex'), 1, 32),
  true
);

-- Get the key you just created
SELECT api_key FROM apps WHERE name = 'Base44 CRM';
```

**Save this key securely** - you'll give it to Base44.

### Step 2: Configure Base44 Secrets

In Base44's `.env` file:

```env
# Where to send API requests
CTI_API_BASE_URL=https://your-cti-backend.com

# How to authenticate
CTI_API_KEY=app_a1b2c3d4e5f6g7h8i9j0k1l2

# Optional: Feature flags
CTI_ENABLE_CALL_RECORDING=true
CTI_POLLING_INTERVAL_MS=5000
```

### Step 3: Configure Dialpad Webhook

In Dialpad Admin Console:

```
Settings → Webhooks → Add New

URL: https://your-cti-backend.com/webhooks/dialpad
Authentication:
  - Signature Header: x-dialpad-signature
  - Secret: DIALPAD_WEBHOOK_SECRET (store in your .env)

Events to subscribe:
  - call.started
  - call.ring
  - call.ended
  - call.recording.completed
```

### Step 4: Configure Your CTI Backend `.env`

```env
# Dialpad OAuth (for admin setup flow)
DIALPAD_CLIENT_ID=your_client_id
DIALPAD_CLIENT_SECRET=your_client_secret
DIALPAD_REDIRECT_URI=https://your-cti-backend.com/auth/dialpad/callback
DIALPAD_SANDBOX_BASE_URL=https://sandbox.dialpad.com
DIALPAD_PROD_BASE_URL=https://dialpad.com

# Webhook Security
DIALPAD_WEBHOOK_SIGNATURE_HEADER=x-dialpad-signature
DIALPAD_WEBHOOK_SECRET=your_webhook_secret_from_dialpad

# Server
NODE_ENV=production
PORT=443  # or 8443 if behind load balancer
DATABASE_URL=postgresql://user:password@prod-db.example.com/cti

# Optional
LOG_LEVEL=info
```

---

## Security Best Practices

### 1. API Key Storage

**Never hardcode API keys:**

❌ BAD:

```javascript
const API_KEY = "app_a1b2c3d4e5f6g7h8i9j0k1l2"; // Commits to git!
```

✅ GOOD - In Base44 `.env`:

```env
CTI_API_KEY=app_a1b2c3d4e5f6g7h8i9j0k1l2
```

✅ GOOD - Use secrets manager (AWS, HashiCorp, etc):

```javascript
const API_KEY = await secretsManager.get("cti/api-key");
```

### 2. API Key Rotation

**Every 90 days, generate a new key:**

```sql
-- Generate new key
UPDATE apps
SET api_key = 'app_' || substr(encode(gen_random_bytes(32), 'hex'), 1, 32)
WHERE id = 'your-app-id';

-- Update Base44's .env with new key
-- Restart both services
```

### 3. API Key Scope

Your API key can currently:

- ✓ Read all calls for that app/tenant
- ✓ Filter by status, direction, phone number
- ✓ Paginate results

It CANNOT:

- ✗ Read other app's calls (tenant isolation)
- ✗ Modify calls (read-only endpoints)
- ✗ Access webhook internals
- ✗ Access Dialpad OAuth tokens

### 4. HTTPS/TLS in Production

All API key transmission must use HTTPS:

```
❌ http://your-cti-backend.com/api/calls  (INSECURE)
✓ https://your-cti-backend.com/api/calls  (SECURE)
```

### 5. Rate Limiting (Recommended)

Add rate limiting to Base44 API routes:

```javascript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  keyGenerator: (req) => req.headers["x-app-api-key"], // Per API key
});

app.use("/api/calls", limiter);
```

### 6. Monitoring & Alerts

Monitor API key usage:

```sql
-- API calls per app in last hour
SELECT
  app_id,
  a.name,
  COUNT(*) as api_calls
FROM request_logs
WHERE created_at > now() - interval '1 hour'
GROUP BY app_id, a.name
ORDER BY api_calls DESC;
```

---

## Request/Response Examples

### Scenario: Base44 Fetches Active Calls

**Base44 makes this request:**

```bash
curl -X GET https://your-cti-backend.com/api/calls/active \
  -H "Content-Type: application/json" \
  -H "x-app-api-key: app_a1b2c3d4e5f6g7h8i9j0k1l2"
```

**Your CTI backend processes:**

1. ✓ Receives request with API key
2. ✓ Middleware: `apiKeyAuth` looks up key in `apps` table
3. ✓ Resolves: `app_id = "550e8400-e29b-41d4-a716-446655440000"`
4. ✓ Sets: `req.app_id = "550e8400-e29b-41d4-a716-446655440000"`
5. ✓ Controller: Calls service with filters
6. ✓ Service: Executes:
   ```sql
   SELECT * FROM calls
   WHERE app_id = $1 AND status IN ('ringing', 'active')
   ORDER BY started_at DESC
   LIMIT 50
   ```
7. ✓ Returns JSON with active calls

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "dialpad_call_id": 123456789,
      "direction": "inbound",
      "from_number": "+15551234567",
      "to_number": "+15559876543",
      "status": "ringing",
      "started_at": "2026-01-27T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 3,
    "has_more": false
  }
}
```

---

## Quick Reference: When API Keys Are Sent

| Flow       | Direction | When       | Header                     | Used For                        |
| ---------- | --------- | ---------- | -------------------------- | ------------------------------- |
| **Flow 1** | OAuth     | Setup (1x) | N/A                        | Dialpad OAuth2 authorization    |
| **Flow 2** | Webhook   | Continuous | `x-app-api-key` (optional) | Dialpad → Backend routing       |
| **Flow 3** | API       | On-demand  | `x-app-api-key` (required) | Base44 → Backend authentication |

---

## Troubleshooting

### "Missing x-app-api-key header"

Base44 isn't sending the API key. Check:

- ✓ `CTI_API_KEY=...` is set in Base44 `.env`
- ✓ fetch() headers include `'x-app-api-key': process.env.CTI_API_KEY`

### "Invalid API key"

The key doesn't exist or is inactive. Check:

- ✓ API key matches database exactly
- ✓ App is active: `SELECT is_active FROM apps WHERE api_key = '...'`
- ✓ No typos/spaces in key

### "App is inactive"

The app exists but is disabled. Check:

- ✓ `SELECT is_active FROM apps WHERE api_key = '...'`
- ✓ Update: `UPDATE apps SET is_active = true WHERE api_key = '...'`

### Webhooks not arriving

This is NOT API key related. Webhooks use Dialpad's signature. Check:

- ✓ Webhook URL is publicly accessible
- ✓ `DIALPAD_WEBHOOK_SECRET` matches Dialpad settings
- ✓ Check Dialpad Admin → Webhook logs

---

## Summary

```
╔═══════════════════════════════════════════════════════════════╗
║                  API KEY FLOW SUMMARY                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Flow 1: Dialpad OAuth                                        ║
║  ────────────────────────────────                             ║
║  Dialpad → Backend → Dialpad (code exchange)                 ║
║  → Stored: dialpad_connections.access_token                  ║
║  → NOT an API key (it's an OAuth token)                       ║
║  → Set up ONCE per Dialpad workspace                          ║
║                                                               ║
║  Flow 2: Webhook Ingestion                                    ║
║  ────────────────────────                                     ║
║  Dialpad → Backend (event data)                              ║
║  → Verified using DIALPAD_WEBHOOK_SECRET                      ║
║  → Optional: x-app-api-key header for routing                 ║
║  → Continuous (whenever events occur)                         ║
║                                                               ║
║  Flow 3: Calls API (Base44 reads)                             ║
║  ───────────────────────────────                              ║
║  Base44 → Backend (GET /api/calls)                           ║
║  → Required: x-app-api-key header                             ║
║  → Validated against apps.api_key                             ║
║  → On-demand (when Base44 needs data)                         ║
║  → Read-only, tenant-isolated                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

**You send API keys to your backend in production from Base44, every time it makes API calls to `/api/calls*` endpoints.**
