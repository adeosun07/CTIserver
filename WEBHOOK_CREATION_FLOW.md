# Webhook Creation Flow: How Webhooks Get Created Automatically

This document explains how webhook IDs are created when the server is live, and how the OAuth flow connects everything together.

---

## Table of Contents

1. [Overview](#overview)
2. [OAuth Flow (Prerequisites)](#oauth-flow-prerequisites)
3. [Automatic Webhook Creation](#automatic-webhook-creation)
4. [Manual Webhook Creation (Fallback)](#manual-webhook-creation-fallback)
5. [Step-by-Step Production Walkthrough](#step-by-step-production-walkthrough)

---

## Overview

### The Problem You Solved

You manually created a webhook via Postman because:

- You had a `dialpadAccessToken` (from the client's OAuth)
- You called Dialpad's API directly: `POST https://dialpad.com/api/v2/webhooks`
- This created the webhook and returned a `webhook_id`

### The Automated Solution

When the server is live, the webhook creation should be **automated**:

1. Client completes OAuth → CTI server stores their `access_token` in database
2. Owner calls: `POST /internal/webhooks/create?app_id={app_id}`
3. CTI server retrieves the stored `access_token` from database
4. CTI server calls Dialpad API to create webhook (using that token)
5. Webhook created, `webhook_id` returned and stored
6. Owner creates subscriptions for that `webhook_id`

---

## OAuth Flow (Prerequisites)

### What Happens During OAuth

When a client clicks "Connect Dialpad" in your app:

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Client Initiates OAuth                              │
│ ─────────────────────────────────────────────────────────────│
│ URL: GET /auth/dialpad/connect?app_id={app_id}              │
│ Server: Redirects to Dialpad login                          │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Client Logs In & Approves Scopes                    │
│ ─────────────────────────────────────────────────────────────│
│ Client logs in to their Dialpad account                     │
│ Client grants permissions (calls:list, offline_access, etc) │
│ Dialpad redirects back to:                                  │
│ GET /auth/dialpad/callback?code={auth_code}&state={state}   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Exchange Auth Code for Tokens                       │
│ ─────────────────────────────────────────────────────────────│
│ POST /oauth2/token (Dialpad endpoint)                       │
│ Headers: auth_code, client_id, client_secret                │
│ Response: {                                                 │
│   "access_token": "ABC123...",  ← 30-min token             │
│   "refresh_token": "XYZ789...", ← For token refresh        │
│   "organization_id": 4993497561530368                       │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Store Tokens in Database                            │
│ ─────────────────────────────────────────────────────────────│
│ INSERT INTO dialpad_connections:                            │
│ {                                                            │
│   app_id: "client-app-uuid",                                │
│   dialpad_org_id: 4993497561530368,  ← Their Org ID        │
│   access_token: "ABC123...",         ← Stored securely     │
│   refresh_token: "XYZ789...",        ← For auto-refresh    │
│   token_expires_at: 2025-02-04T23:51:00Z                   │
│ }                                                            │
│                                                              │
│ Now the server can make API calls on behalf of the client! │
└─────────────────────────────────────────────────────────────┘
```

**This is the critical step**: After OAuth, the `access_token` is stored in the database.

---

## Automatic Webhook Creation

### Now You Can Create the Webhook Automatically

Once OAuth is complete and `access_token` is stored, you can create the webhook:

```
┌─────────────────────────────────────────────────────────────┐
│ Owner Calls: POST /internal/webhooks/create?app_id={app_id} │
│ Header: Authorization: Bearer {INTERNAL_API_SECRET}         │
│ Body (optional):                                            │
│ {                                                            │
│   "webhook_url": "https://cti-server.onrender.com/...",    │
│   "webhook_secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d..."        │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Server: Lookup Access Token                                 │
│ ─────────────────────────────────────────────────────────────│
│ SELECT access_token FROM dialpad_connections                │
│ WHERE app_id = {app_id};                                    │
│                                                              │
│ Result: "ABC123..." ← Retrieved from database               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Server: Call Dialpad API (Using Client's Token)             │
│ ─────────────────────────────────────────────────────────────│
│ POST https://dialpad.com/api/v2/webhooks                    │
│ Headers:                                                    │
│   Authorization: Bearer ABC123...  ← Client's token!        │
│   Content-Type: application/json                            │
│ Body:                                                       │
│ {                                                            │
│   "hook_url": "https://cti-server.onrender.com/webhooks/...",
│   "secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d..."                │
│ }                                                            │
│                                                              │
│ Dialpad Response:                                           │
│ {                                                            │
│   "id": 12345678,  ← THE WEBHOOK ID!                        │
│   "hook_url": "...",                                        │
│   "secret": {...},                                          │
│   "created_at": "2025-02-04T22:51:00Z"                     │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Server: Store Webhook Metadata                              │
│ ─────────────────────────────────────────────────────────────│
│ INSERT INTO dialpad_webhooks:                               │
│ {                                                            │
│   app_id: "client-app-uuid",                                │
│   webhook_id: 12345678,           ← Stored!                │
│   hook_url: "https://cti-server...",                        │
│   secret: {...}                                             │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Response to Owner:                                          │
│ HTTP 201 Created                                            │
│ {                                                            │
│   "success": true,                                          │
│   "webhook_id": 12345678,                                   │
│   "message": "Webhook created successfully",                │
│   "next_step": "Create subscriptions for call/SMS events"   │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Manual Webhook Creation (Fallback)

If the automated endpoint doesn't work or you want to do it manually:

### Via Postman (Same as You Did)

**Step 1: Get the Client's Access Token**

After OAuth completes, the client has an `access_token`. They can share it with you (for testing) or you retrieve it from database:

```sql
SELECT access_token FROM dialpad_connections
WHERE app_id = 'YOUR_APP_ID';
```

**Step 2: Create Webhook via Dialpad API**

```
POST https://dialpad.com/api/v2/webhooks
Headers:
  Authorization: Bearer {access_token}
  Content-Type: application/json

Body:
{
  "hook_url": "https://cti-server.onrender.com/webhooks/dialpad",
  "secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4"
}

Response:
{
  "id": 12345678,
  "hook_url": "https://cti-server.onrender.com/webhooks/dialpad",
  "secret": {...},
  "created_at": "2025-02-04T22:51:00Z"
}
```

**Step 3: Store the webhook_id Locally (Database)**

```sql
INSERT INTO dialpad_webhooks (app_id, webhook_id, hook_url, secret, algo, signature_type)
VALUES ('YOUR_APP_ID', 12345678, '...', '...', 'HS256', 'hmac');
```

---

## Step-by-Step Production Walkthrough

### Timeline: From OAuth to Webhook to Live Events

```
T=0s:  Client clicks "Connect Dialpad" button in their app
       ↓
T=2s:  Client logs in to Dialpad, grants permissions
       ↓
T=3s:  OAuth callback completes
       ↓
T=4s:  INSERT dialpad_connections (with access_token stored)
       ↓
T=5s:  Owner calls: POST /internal/webhooks/create?app_id={app_id}
       ↓
T=7s:  Server retrieves access_token from database
       ↓
T=8s:  Server calls Dialpad API to create webhook
       ↓
T=9s:  Webhook created in Dialpad with ID: 12345678
       ↓
T=10s: Webhook metadata stored in dialpad_webhooks table
       ↓
T=11s: Owner creates subscriptions for webhook_id 12345678
       ↓
T=15s: Subscriptions confirmed in Dialpad
       ↓
T=20s: Client makes test call in Dialpad
       ↓
T=21s: Dialpad sends webhook → CTI Server
       ↓
T=22s: CTI Server receives, decodes JWT, verifies
       ↓
T=23s: Event stored in webhook_events, then calls table
       ↓
T=24s: Client queries /api/calls and sees the call ✓
```

---

## Production Setup Checklist

### Before Going Live:

- [ ] Deploy CTI server to Render (or your hosting)
- [ ] Set `NODE_ENV=production` in Render environment
- [ ] Configure `DIALPAD_PROD_CLIENT_ID`, `DIALPAD_PROD_CLIENT_SECRET`
- [ ] Get production `webhook_secret` from Dialpad support
- [ ] Set `DIALPAD_WEBHOOK_SECRET` in Render
- [ ] Set `DIALPAD_PROD_REDIRECT_URI` to your Render domain (for webhook creation)

### For Each Client:

1. **Have them complete OAuth**

   ```
   https://cti-server.onrender.com/auth/dialpad/connect?app_id={their_app_id}
   ```

2. **Verify connection in database**

   ```sql
   SELECT * FROM dialpad_connections WHERE app_id = '{their_app_id}';
   ```

   Should have: `access_token`, `refresh_token`, `dialpad_org_id`

3. **Automatically create webhook**

   ```bash
   curl -X POST \
     https://cti-server.onrender.com/internal/webhooks/create?app_id={their_app_id} \
     -H "Authorization: Bearer {INTERNAL_API_SECRET}" \
     -H "Content-Type: application/json"
   ```

4. **Get webhook_id from response**

   ```json
   {
     "success": true,
     "webhook_id": 12345678,
     "next_step": "Create subscriptions..."
   }
   ```

5. **Create subscriptions**

   ```bash
   # Call events
   curl -X POST https://dialpad.com/api/v2/subscriptions/call \
     -H "Authorization: Bearer {client_access_token}" \
     -d '{
       "webhook_id": 12345678,
       "call_states": ["ringing", "connected", "voicemail", "missed", "hangup"],
       "enabled": true
     }'

   # SMS events (optional)
   curl -X POST https://dialpad.com/api/v2/subscriptions/sms \
     -H "Authorization: Bearer {client_access_token}" \
     -d '{
       "webhook_id": 12345678,
       "direction": "all",
       "enabled": true,
       "status": true
     }'
   ```

6. **Test with real events**
   - Make a test call in Dialpad
   - Verify webhook arrives at CTI server (check logs)
   - Confirm event in `webhook_events` table
   - Confirm call in `calls` table
   - Query `/api/calls` and see the data ✓

---

## How This Solves Your Question

**Your Original Question:**

> How will the webhook_id be created automatically when the server is live?

**Answer:**

1. **OAuth stores the access token** → `dialpad_connections` table has `access_token`
2. **You call `/internal/webhooks/create`** → Server uses stored `access_token`
3. **Server calls Dialpad API** → Webhook created, ID returned
4. **Webhook metadata stored** → `dialpad_webhooks` table saves the ID
5. **Live is ready** → Webhooks now arrive with full authentication

The `dialpadAccessToken` the client sent you during manual testing is the same token that gets stored in the database during OAuth. The automated endpoint just retrieves it and uses it to create the webhook without needing manual intervention.

---

## API Endpoint Reference

### POST /internal/webhooks/create

Creates a webhook in Dialpad automatically.

**Parameters:**

```
Query:
  app_id (required) - The CTI app ID

Body (optional):
  webhook_url - Override default webhook URL
  webhook_secret - Override DIALPAD_WEBHOOK_SECRET from .env
```

**Example:**

```bash
curl -X POST \
  'https://cti-server.onrender.com/internal/webhooks/create?app_id=abc-123' \
  -H 'Authorization: Bearer YOUR_INTERNAL_API_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{
    "webhook_url": "https://cti-server.onrender.com/webhooks/dialpad",
    "webhook_secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Webhook created successfully",
  "webhook_id": 12345678,
  "hook_url": "https://cti-server.onrender.com/webhooks/dialpad",
  "next_step": "Create subscriptions for call/SMS events using webhook_id"
}
```

**Errors:**

- `400`: app_id not provided or no Dialpad connection
- `404`: App not connected to Dialpad
- `502`: Failed to create webhook in Dialpad (check token validity)
- `500`: Server error
