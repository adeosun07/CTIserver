# CTI Server - Complete Usage Guide

## Overview

The CTI (Computer Telephony Integration) Server is a Node.js backend service that bridges your application with Dialpad's telephony APIs. It handles:

- **OAuth 2.0 authentication** with Dialpad (sandbox & production)
- **Webhook processing** for call events (inbound/outbound/voicemail)
- **Call management APIs** to query and manage calls
- **Real-time WebSocket updates** for live call data
- **API key authentication** for client apps with bcrypt hashing
- **Multi-tenant support** with per-app isolation

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│         Your Application Backend                      │
│  (Mobile App, Web App, CRM, Desktop Client)           │
└──────────┬───────────────────────────────────────────┘
           │ HTTP + API Key (x-app-api-key header)
           │
┌──────────▼───────────────────────────────────────────┐
│         CTI Server (Port 4000)                        │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ API Endpoints (Protected by API Key)             │ │
│  │ • GET /api/calls/active - List active calls      │ │
│  │ • GET /api/calls/:id - Get call details          │ │
│  │ • WebSocket /ws - Real-time call updates        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Webhook Handler (Protected by HMAC signature)    │ │
│  │ • POST /webhooks/dialpad - Receives call events  │ │
│  │ • Validates signatures, stores events            │ │
│  │ • Asynchronously processes via event processor   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Admin Endpoints (Protected by INTERNAL_SECRET)   │ │
│  │ • POST /internal/apps - Create app               │ │
│  │ • POST /internal/apps/:id/api-key - Gen key      │ │
│  │ • POST /internal/apps/:id/users/map - Map users  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Dialpad OAuth Flow                               │ │
│  │ • GET /auth/dialpad/authorize - Start OAuth      │ │
│  │ • GET /auth/dialpad/callback - Receive token     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────┬───────────────────────────────────────────┘
           │ HTTPS + OAuth Token
           │
┌──────────▼───────────────────────────────────────────┐
│    Dialpad Sandbox or Production                      │
│    • OAuth 2.0 Authorization Server                   │
│    • Calls API (call history, details)                │
│    • Webhook Delivery (inbound webhooks)              │
└──────────────────────────────────────────────────────┘

           │ HTTPS (Reverse)
           │
┌──────────▼───────────────────────────────────────────┐
│    PostgreSQL Database (localhost:5432)               │
│    • apps - Tenant records                            │
│    • calls - Call history                             │
│    • webhook_events - Event queue                     │
│    • dialpad_connections - OAuth tokens               │
│    • voicemails - Voicemail records                   │
│    • dialpad_user_mappings - User context             │
└──────────────────────────────────────────────────────┘
```

---

## Setup & Configuration

### Prerequisites

- **Node.js** v18+
- **PostgreSQL** 12+ (local or managed service)
- **Dialpad Account** with API credentials (sandbox or production) (remember to set webhook endpoint to your-domain/webhooks/dialpad) 
- **API Key Management** (distributed to client apps)

### Environment Variables

```bash
# Server
PORT=4000
NODE_ENV=sandbox                    # "sandbox" or "production"

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=CTI

# Dialpad Sandbox OAuth
DIALPAD_SANDBOX_CLIENT_ID=your-sandbox-client-id
DIALPAD_SANDBOX_CLIENT_SECRET=your-sandbox-secret
DIALPAD_SANDBOX_REDIRECT_URI=https://localhost:4000/auth/dialpad/callback

# Dialpad Production OAuth (optional, only if NODE_ENV=production)
DIALPAD_PROD_CLIENT_ID=your-prod-client-id
DIALPAD_PROD_CLIENT_SECRET=your-prod-secret
DIALPAD_PROD_REDIRECT_URI=https://your-domain.com/auth/dialpad/callback

# Dialpad Webhooks
DIALPAD_WEBHOOK_SECRET=your-webhook-secret (to be set as signature secret in your dialpad)

# Internal Administration
INTERNAL_API_SECRET=your-internal-admin-secret 

# OAuth Scopes
DIALPAD_SCOPES="calls:list recordings_export offline_access"
```

### Database Setup

```bash
# 1. Create PostgreSQL database
createdb -U postgres CTI

# 2. Apply schema
psql -U postgres -d CTI -f DB_Schema.sql

# 3. Verify tables exist
psql -U postgres -d CTI -c "\dt"
```

### Server Startup

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

**Expected output:**

```
✓ All required environment variables configured
Server running on http://localhost:4000
✓ Database connection verified
✓ WebSocket server initialized
✓ Call event handlers registered
✓ Webhook event processor started
```

---

## Sandbox vs Production

### Sandbox Environment

**When to use:** Development, testing, prototyping

**Configuration:**

```bash
NODE_ENV=sandbox
DIALPAD_SANDBOX_CLIENT_ID=...
DIALPAD_SANDBOX_CLIENT_SECRET=...
DIALPAD_SANDBOX_REDIRECT_URI=https://localhost:4000/auth/dialpad/callback
```

**Characteristics:**

- Dialpad sandbox org (test data)
- No real calls/messages
- Webhook delivery simulated via Postman
- No rate limiting concerns
- Faster iteration

### Production Environment

**When to use:** Live deployments, real call handling

**Configuration:**

```bash
NODE_ENV=production
DIALPAD_PROD_CLIENT_ID=...
DIALPAD_PROD_CLIENT_SECRET=...
DIALPAD_PROD_REDIRECT_URI=https://your-domain.com/auth/dialpad/callback
```

**Requirements:**

- Valid SSL/TLS certificate (HTTPS enforced)
- Dialpad production org
- Public webhook endpoint (for real Dialpad webhooks)
- Rate limiting: 300 req/min per IP for APIs
- Database backups and monitoring

---

## Workflow: How It All Works Together

### 1. **App Registration (One-time Setup)**

Your application registers with the CTI server:

```bash
curl -X POST http://localhost:4000/internal/apps \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Mobile App"}'
```

**Response:**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My Mobile App",
  "api_key": "raw_abcdef0123456789...",
  "created_at": "2026-01-29T12:00:00Z"
}
```

**App stores:** `app_id` and `api_key` locally (secure storage)

### 2. **Dialpad OAuth (One-time Auth)**

User authorizes your app to access Dialpad:

```
1. App redirects user → http://localhost:4000/auth/dialpad/authorize
   (User logs into Dialpad)

2. Dialpad redirects back → http://localhost:4000/auth/dialpad/callback?code=...
   (CTI server exchanges code for access token)

3. CTI server stores token in database (encrypted)

4. Server returns → { "status": "connected", "org_id": 12345 }
```

### 3. **API Calls (Per Request)**

App queries calls via CTI server:

```bash
curl -X GET "http://localhost:4000/api/calls/active" \
  -H "x-app-api-key: raw_abcdef0123456789..."
```

**Request flow:**

1. Server validates API key against bcrypt hash
2. Retrieves `app_id` from key
3. Queries database for calls belonging to that app
4. Returns filtered results

**Response:**

```json
{
  "success": true,
  "calls": [
    {
      "id": "uuid",
      "dialpad_call_id": 999999,
      "direction": "inbound",
      "from_number": "+15550001111",
      "to_number": "+15550002222",
      "status": "ringing",
      "started_at": "2026-01-29T12:00:00Z"
    }
  ]
}
```

### 4. **Webhooks (Asynchronous)**

Dialpad sends call events to CTI server in real-time:

```
1. Dialpad → POST /webhooks/dialpad (signed with webhook secret)
   Payload: { "event_type": "call.ring", "call": { ... } }

2. CTI server validates HMAC signature

3. Server stores event in webhook_events table (marked unprocessed)

4. Event processor polls every 5 seconds

5. Processor routes to call handler (call.ring → handleCallRing)

6. Handler inserts/updates calls table

7. Server broadcasts via WebSocket to connected clients
```

### 5. **Real-time Updates (WebSocket)**

App subscribes to live updates:

```javascript
const ws = new WebSocket("ws://localhost:4000/ws");

ws.send(
  JSON.stringify({
    type: "subscribe",
    app_id: "550e8400-e29b-41d4-a716-446655440000",
    api_key: "raw_abcdef0123456789...",
  }),
);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Call update:", data);
  // { "event": "call.started", "call_id": 999999, "status": "active" }
};
```

---

## Multi-Tenant Isolation

Each app is completely isolated:

```
App A (app_id: uuid-1)
  └─ Can only see calls from uuid-1
  └─ api_key for app-a is hashed separately
  └─ Webhook events filtered by app_id
  └─ User mappings per-app

App B (app_id: uuid-2)
  └─ Can only see calls from uuid-2
  └─ api_key for app-b is hashed separately
  └─ Completely separate data
```

**Database enforces this via foreign keys:**

- `calls.app_id` - each call belongs to an app
- `webhook_events.app_id` - events filtered by app
- Queries always include `WHERE app_id = :app_id`

---

## Security Model

### API Key Authentication

**How it works:**

1. App calls `POST /internal/apps` → receives plain key once
2. Server hashes key with bcrypt (cost 10)
3. Hashed key stored in database
4. App includes plain key in `x-app-api-key` header on each request
5. Server validates: `bcrypt.compare(plainKey, hashedKey)`

**Benefits:**

- ✅ Plain key never stored
- ✅ Key shown only once at creation
- ✅ Lost key cannot be recovered (must regenerate)
- ✅ Database breach doesn't expose keys

### HMAC Webhook Signature

**How it works:**

1. Dialpad sends webhook with `x-dialpad-signature` header
2. Server computes: `HMAC-SHA256(request_body, DIALPAD_WEBHOOK_SECRET)`
3. Compares computed signature to header value
4. If mismatch, rejects webhook (401)

**Benefits:**

- ✅ Verifies webhook comes from Dialpad
- ✅ Prevents spoofed events
- ✅ Validates payload integrity

### Internal Admin Endpoints

**Protected by:** `Authorization: Bearer <INTERNAL_API_SECRET>`

**Use cases:**

- Creating apps
- Rotating API keys
- Mapping Dialpad users to CRM users

**Never expose these in client apps** - keep secret server-side only

---

## User Mapping (Optional)

Connect Dialpad users to your CRM users:

```bash
curl -X POST "http://localhost:4000/internal/apps/:app_id/users/map" \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "dialpad_user_id": 12345,
    "crm_user_id": "crm_user_001"
  }'
```

**Benefits:**

- When a call comes in, CTI server enriches it with CRM context
- API responses include `user_id` (mapped to CRM user)
- Enables call logs with full user context

---

## Monitoring & Observability

### Health Check

```bash
curl http://localhost:4000/health
```

Response:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-29T12:00:00Z",
  "uptime": 3600,
  "environment": "sandbox",
  "port": 4000
}
```

### Metrics

```bash
curl http://localhost:4000/metrics
```

Response:

```json
{
  "timestamp": "2026-01-29T12:00:00Z",
  "memory": {
    "heap_used_mb": 45,
    "heap_total_mb": 128,
    "external_mb": 2
  },
  "uptime_seconds": 3600
}
```

### Logging

All requests logged with:

- HTTP method, path, status code
- Response time (ms)
- Client IP
- Error details

**Log levels:**

- `info` - Important events (startup, auth, creation)
- `warn` - Recoverable issues (auth failure, missing data)
- `error` - Unrecoverable issues (db errors, crashes)
- `debug` - Detailed request/response (disable in prod)

---

## Common Workflows

### Scenario 1: Handle Inbound Call

1. **Dialpad detects incoming call** → sends webhook to CTI server
2. **CTI server stores event** in `webhook_events` table (unprocessed)
3. **Event processor polls** and finds unprocessed event
4. **Call handler inserts** record into `calls` table with status=`ringing`
5. **WebSocket broadcasts** to all connected clients for that app
6. **Client app receives** real-time notification → shows incoming call UI
7. **User answers** → Dialpad sends `call.started` event → updates status to `active`
8. **Call ends** → Dialpad sends `call.ended` event → final status, duration recorded

### Scenario 2: Query Call History

1. **App calls** `GET /api/calls/active` with API key
2. **CTI server validates** key → resolves app_id
3. **Server queries** database: `SELECT * FROM calls WHERE app_id = ? AND status IN ('ringing', 'active')`
4. **Returns** list of active calls with numbers, times, users
5. **App displays** to user in dashboard or call history

### Scenario 3: Rotate API Key

1. **Admin calls** `POST /internal/apps/:id/api-key` with INTERNAL_API_SECRET
2. **Server generates** new random key
3. **Hashes and stores** new key in database
4. **Logs rotation** to `api_key_audit_log`
5. **Returns** new plain key (once)
6. **Old key becomes invalid** immediately
7. **App updates** stored key and continues with new one

---

## Troubleshooting

### "Unauthorized" (401) on API Calls

**Cause:** Invalid or missing API key

**Solution:**

1. Verify `x-app-api-key` header is present
2. Confirm value matches generated key (exact match)
3. If lost, regenerate via `POST /internal/apps/:id/api-key`

### Webhooks Not Processing

**Cause:** Event processor not running or signature invalid

**Solution:**

1. Check server logs for "Webhook event processor started"
2. Verify `DIALPAD_WEBHOOK_SECRET` matches Dialpad settings
3. Check `webhook_events` table - is `processed_at` NULL?
4. Run manual processor: `node scripts/processEvents.js`

### Calls Table Empty After Webhook

**Cause:** Event handler failed (usually schema mismatch)

**Solution:**

1. Check server error logs for SQL errors
2. Verify all migration files applied
3. Run: `node scripts/processEvents.js stats`
4. Check `webhook_events.payload` - is it valid?

---

## Production Deployment Checklist

- [ ] SSL/TLS certificate configured (HTTPS only)
- [ ] Database backed up daily
- [ ] `INTERNAL_API_SECRET` is strong (32+ random chars)
- [ ] `DIALPAD_WEBHOOK_SECRET` matches Dialpad webhook settings
- [ ] Production Dialpad OAuth credentials configured
- [ ] Rate limiting enabled (default: 300 req/min API)
- [ ] Logging configured (file output, rotation)
- [ ] Monitoring alerts set up (downtime, errors)
- [ ] API key rotation policy documented
- [ ] Disaster recovery plan in place

---

## Next Steps

1. See [CTI_SERVER_API.md](CTI_SERVER_API.md) for endpoint reference
2. See [DB_Schema.sql](DB_Schema.sql) for database setup
3. Review [LOCAL_TESTING_GUIDE.md](LOCAL_TESTING_GUIDE.md) for sandbox testing
