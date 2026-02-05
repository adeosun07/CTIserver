# CTI Server - Sandbox Testing Guide

This guide walks you through sandbox testing with Postman and a public HTTPS tunnel. It mirrors the local testing flow, but uses Dialpad sandbox OAuth and real webhook delivery.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 0: Environment & Database Setup](#phase-0-environment--database-setup)
3. [Phase 1: Server Startup](#phase-1-server-startup)
4. [Phase 2: Public HTTPS Tunnel](#phase-2-public-https-tunnel)
5. [Phase 3: Postman Environment Setup](#phase-3-postman-environment-setup)
6. [Phase 4: CTI App Registration](#phase-4-cti-app-registration)
7. [Phase 5: Dialpad OAuth (Sandbox)](#phase-5-dialpad-oauth-sandbox)
8. [Phase 6: Webhook Creation & Subscriptions](#phase-6-webhook-creation--subscriptions)
9. [Phase 7: Webhook Verification & Event Processing](#phase-7-webhook-verification--event-processing)
10. [Phase 8: API Validation](#phase-8-api-validation)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Dialpad sandbox app created (Client ID + Client Secret).
- Public HTTPS URL (ngrok or a sandbox domain).
- PostgreSQL database reachable from the CTI server.
- Postman installed.

---

## Phase 0: Environment & Database Setup

### Step 0.1: Verify .env Variables

Ensure these are set:

```
PORT=4000
DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_SSL=true
NODE_ENV=sandbox

DIALPAD_SANDBOX_CLIENT_ID=...
DIALPAD_SANDBOX_CLIENT_SECRET=...
DIALPAD_SANDBOX_REDIRECT_URI=https://<your-ngrok-domain>/auth/dialpad/callback

DIALPAD_WEBHOOK_SECRET=...
INTERNAL_API_SECRET=...
```

### Step 0.2: Apply DB Schema

Use either:

- migrations in order, or
- `DB_Schema.sql` for a full rebuild.

Verify key tables:

- `apps`
- `dialpad_connections`
- `webhook_events`
- `calls`
- `dialpad_webhooks`

---

## Phase 1: Server Startup

Start the server and confirm:

- “✓ All required environment variables configured”
- “✓ Database connection verified”
- “✓ Webhook event processor started”

Health check:

- GET `http://localhost:4000/health`

---

## Phase 2: Public HTTPS Tunnel

Set up ngrok (or your sandbox domain) and confirm HTTPS is reachable.

Webhook URL:

- `https://<your-ngrok-domain>/webhooks/dialpad`

OAuth callback:

- `https://<your-ngrok-domain>/auth/dialpad/callback`

Make sure the Dialpad app redirect URI matches exactly.

---

## Phase 3: Postman Environment Setup

Create a Postman environment named `CTI Sandbox` with:

| Variable             | Example Value            | Notes                        |
| -------------------- | ------------------------ | ---------------------------- |
| `baseUrl`            | http://localhost:4000    | CTI server base URL          |
| `internalSecret`     | <INTERNAL_API_SECRET>    | From .env                    |
| `webhookSecret`      | <DIALPAD_WEBHOOK_SECRET> | From .env                    |
| `appId`              | (empty)                  | Set after CTI app creation   |
| `apiKey`             | (empty)                  | Set after API key generation |
| `dialpadAccessToken` | (empty)                  | Set after OAuth              |
| `webhookId`          | (empty)                  | Set after webhook creation   |

---

## Phase 4: CTI App Registration

### Step 4.1: Create App

**Method:** POST  
**URL:** `{{baseUrl}}/internal/apps`  
**Auth:** Bearer Token (`{{internalSecret}}`)  
**Body:**

```json
{ "name": "Sandbox Test App" }
```

Save `app_id` into `appId`.

### Step 4.2: Generate API Key

**Method:** POST  
**URL:** `{{baseUrl}}/internal/apps/{{appId}}/api-key`  
**Auth:** Bearer Token (`{{internalSecret}}`)

Save `api_key` into `apiKey` (one-time view).

---

## Phase 5: Dialpad OAuth (Sandbox)

Use OAuth Authorization Code flow. Two common paths:

**Option A: Browser flow**

- Open the authorize URL with your client_id, redirect_uri, and scopes.
- Complete login; your CTI server handles `/auth/dialpad/callback`.

**Option B: Postman OAuth**

- Use OAuth2 Authorization Code flow in Postman.
- Make sure the redirect URI exactly matches the Dialpad app setting.

After OAuth, confirm a row exists in `dialpad_connections` for your `app_id`.

---

## Phase 6: Webhook Creation & Subscriptions

### Step 6.1: Create Webhook

**Method:** POST  
**URL:** `https://dialpad.com/api/v2/webhooks`  
**Headers:**

- Authorization: Bearer `{{dialpadAccessToken}}`
- Content-Type: application/json

**Body:**

```json
{
  "hook_url": "https://<your-ngrok-domain>/webhooks/dialpad",
  "secret": "{{webhookSecret}}"
}
```

Save response `id` as `webhookId`.

### Step 6.2: Create Call Event Subscriptions

**Method:** POST  
**URL:** `https://dialpad.com/api/v2/subscriptions/call`  
**Headers:**

- Authorization: Bearer `{{dialpadAccessToken}}`
- Content-Type: application/json

**Body:**

```json
{
  "webhook_id": {{webhookId}},
  "call_states": ["ringing", "connected", "voicemail", "missed"],
  "enabled": true
}
```

**Note:** `call_states` is required and filters which call states trigger events. Common states: `ringing`, `connected`, `voicemail`, `missed`, `held`, `transferred`.

### Step 6.3: Create SMS Event Subscriptions (Optional)

**Method:** POST  
**URL:** `https://dialpad.com/api/v2/subscriptions/sms`  
**Headers:**

- Authorization: Bearer `{{dialpadAccessToken}}`
- Content-Type: application/json

**Body:**

```json
{
  "webhook_id": {{webhookId}},
  "direction": "all",
  "enabled": true,
  "status": true
}
```

**Note:** SMS subscriptions require a `direction` field (`all`, `inbound`, or `outbound`). Set `status: true` to receive delivery status updates.

---

## Phase 7: Webhook Verification & Event Processing

When Dialpad emits events:

- Webhooks hit `POST /webhooks/dialpad`.
- Signature verification uses `DIALPAD_WEBHOOK_SECRET`.
- Events are stored in `webhook_events`.
- The event processor picks them up every 5 seconds.

Dialpad will send events to your hook_url once subscriptions are created. The server processes them into:

- `calls` table (for call.\* events)
- `messages` table (for sms._ and message._ events)
- `voicemails` table (for voicemail events)

### Manual Testing (Postman)

If you want to manually test webhook delivery, use this Pre-request Script to generate a valid signature:

**Pre-request Script:**

```javascript
// Generate HMAC-SHA256 signature for webhook testing
const secret = pm.environment.get("webhookSecret");
const requestBody = pm.request.body.raw;

if (!requestBody || requestBody.trim() === "") {
  console.warn(
    "WARNING: Request body is empty. Signature verification will fail.",
  );
  pm.variables.set("signature", "");
  return;
}

const signature = CryptoJS.HmacSHA256(requestBody, secret).toString(
  CryptoJS.enc.Base64,
);
pm.variables.set("signature", signature);
console.log("Generated signature:", signature);
```

**Test Request:**

- **Method:** POST
- **URL:** `{{baseUrl}}/webhooks/dialpad`
- **Headers:**
  - `x-dialpad-signature`: `{{signature}}`
  - `Content-Type`: `application/json`

**Body (example call event):**

```json
{
  "event_type": "call.ring",
  "organization_id": 123456,
  "call": {
    "id": 999999,
    "direction": "inbound",
    "from": "+15550001111",
    "to": "+15550002222",
    "status": "ringing",
    "target": { "id": 12345, "type": "user" },
    "event_timestamp": 1678900000000
  },
  "event_timestamp": 1678900000000
}
```

**Important:** Make sure the request body is NOT empty—the signature is calculated from the raw JSON body.

---

## Phase 8: API Validation

### Step 8.1: Active Calls

**Method:** GET  
**URL:** `{{baseUrl}}/api/calls/active`  
**Headers:**

- `x-app-api-key`: `{{apiKey}}`

### Step 8.2: Calls List

**Method:** GET  
**URL:** `{{baseUrl}}/api/calls`  
**Headers:**

- `x-app-api-key`: `{{apiKey}}`

### Step 8.3: Messages List

**Method:** GET  
**URL:** `{{baseUrl}}/api/messages`  
**Headers:**

- `x-app-api-key`: `{{apiKey}}`

**Query Params (optional):**

- `?direction=inbound` (filter by direction)
- `?from=%2B15550001111` (filter by phone)
- `?limit=50` (pagination)

---

## Troubleshooting

### OAuth Fails

- Redirect URI mismatch.
- Wrong client credentials.

### Webhooks Not Delivered

- ngrok session expired.
- Webhook URL not HTTPS or not reachable.
- No subscriptions for the webhook_id.

### Signature Verification Failed

- Secret mismatch.
- Request body changed after signature generation.

### Events Not Processed

- Event processor stopped.
- Database connectivity issues.

---

## Sandbox Exit Criteria

You can consider sandbox testing complete when:

- OAuth flow completes successfully.
- Webhook creation and subscriptions succeed.
- Webhooks arrive and are verified.
- Events are stored and processed.
- Calls appear via /api/calls and /api/calls/active.
