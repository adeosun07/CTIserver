# CTI Server Integration Architecture Guide

Complete guide to deploying and integrating the CTI server with your Dialpad account. This server automates app creation, API key generation, webhook creation, event subscriptions, and real-time call/message processing.

---

## 🚀 Quick Start for Production

**For a complete step-by-step production deployment guide, see:**
📖 [PRODUCTION_DEPLOYMENT_GUIDE.md](../PRODUCTION_DEPLOYMENT_GUIDE.md)

That guide includes:

- Deploying to Render
- Configuring PostgreSQL
- Setting up Dialpad
- Complete automation checklist
- Testing and troubleshooting

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Component Overview](#component-overview)
3. [What's Automated](#whats-automated)
4. [Integration Flow](#integration-flow)
5. [Client Application Setup](#client-application-setup)
6. [Webhook Processing Pipeline](#webhook-processing-pipeline)
7. [Sandbox vs Production](#sandbox-vs-production)
8. [Production (Render) Owner Integration Guide](#production-render-owner-integration-guide)
9. [Security Considerations](#security-considerations)

---

## What's Automated

✅ **App Creation** - One API call creates a new app with unique ID  
✅ **API Key Generation** - Cryptographically secure keys for client authentication  
✅ **Webhook Creation** - Server calls Dialpad API to create webhooks automatically  
✅ **Event Subscriptions** - Server subscribes to call and SMS events  
✅ **Token Management** - Server stores and auto-refreshes Dialpad access tokens  
✅ **JWT Verification** - Server verifies HS256 signatures on all incoming webhooks  
✅ **Event Processing** - Webhooks automatically processed every 5 seconds  
✅ **Real-time API** - Call/message data instantly available via REST endpoints

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT APPLICATION                         │
│  (Web/Mobile app - communicates with CTI server via REST API)   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ API Requests (authenticated with API Key)
                         │ GET /api/calls
                         │ GET /api/messages
                         │ GET /api/calls/active
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CTI SERVER (Node.js)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Routes:                                                  │   │
│  │ • /auth/dialpad/connect - OAuth initiation              │   │
│  │ • /auth/dialpad/callback - OAuth token exchange         │   │
│  │ • /webhooks/dialpad - Webhook ingestion (JWT format)    │   │
│  │ • /api/calls - Call data queries                        │   │
│  │ • /api/messages - Message data queries                  │   │
│  │ • /internal/* - Management endpoints                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Services:                                                │   │
│  │ • callsService - Call CRUD operations                   │   │
│  │ • messagesService - Message queries                     │   │
│  │ • dialpadEventProcessor - Webhook event handler         │   │
│  │ • websocketManager - Real-time events (optional)        │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    Webhooks        OAuth Tokens      API Calls
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DIALPAD (SaaS Platform)                        │
│  • OAuth2 Authorization Server                                  │
│  • Webhook Event Publisher (JWT format)                         │
│  • Call & Message APIs                                          │
│  • Recording & Transcription APIs                               │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Event Webhooks (via ngrok/tunnel)
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Tables:                                                  │   │
│  │ • apps - Client applications registered in CTI          │   │
│  │ • dialpad_connections - OAuth tokens per app            │   │
│  │ • webhook_events - Raw webhook events from Dialpad      │   │
│  │ • calls - Processed call records                        │   │
│  │ • messages - SMS/message records                        │   │
│  │ • voicemails - Voicemail records                        │   │
│  │ • dialpad_webhooks - Webhook subscriptions metadata     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Overview

### Client Application

- **Purpose**: The customer's actual app (e.g., sales dashboard, support interface)
- **Interaction**: Makes HTTP requests to CTI server API endpoints
- **Authentication**: Uses API keys (generated per app in CTI server)
- **Data**: Receives calls, messages, voicemails, and call metadata

### CTI Server

- **Purpose**: Acts as middleware between client app and Dialpad
- **Responsibilities**:
  - Manage OAuth connections with Dialpad
  - Ingest webhook events from Dialpad
  - Process and normalize call/message events
  - Provide REST API for client apps
  - Store and query call/message history
- **Environment**: Runs on Node.js with Express framework

### Dialpad

- **OAuth Provider**: Issues access/refresh tokens for secure API access
- **Webhook Publisher**: Sends real-time events (calls, messages, voicemails)
- **Data Source**: Provides call history, recordings, transcriptions via APIs
- **Event Format**: Webhooks sent as JWT (JSON Web Tokens) in sandbox

### PostgreSQL

- **Data Persistence**: Stores all application data
- **Multi-tenancy**: `app_id` column isolates data per client app
- **Event Queue**: `webhook_events` table acts as processing queue

---

## Integration Flow

### 1. Initial Setup (One-time per Client App)

```
1. Client Admin Creates CTI App
   └─> POST /internal/apps
   └─> Response: { app_id, name }

2. Generate API Key for App
   └─> POST /internal/apps/{app_id}/api-key
   └─> Response: { api_key } (one-time display)
   └─> Client stores this securely in their environment

3. Create Dialpad App in Developer Console
   └─> Client creates app in Dialpad portal
   └─> Dialpad provides: Client ID, Client Secret

4. Configure Webhook URL in Dialpad
   └─> Webhook URL: https://cti-server.com/webhooks/dialpad
   └─> Webhook Secret: Generated and stored in CTI .env
   └─> Subscribe to: call events, SMS events, voicemail events
```

### 2. OAuth Connection Flow (Per Client, Interactive)

```
Timeline: Client authorizes CTI to access their Dialpad account

A. Client App Initiates OAuth
   ├─> User clicks "Connect Dialpad" button
   ├─> Client app redirects to: GET /auth/dialpad/connect?app_id={app_id}
   └─> CTI generates PKCE challenge, redirects to Dialpad authorize

B. User Authorizes at Dialpad
   ├─> User logs into Dialpad (if not already logged in)
   ├─> User grants permissions (calls:list, recordings_export, offline_access)
   ├─> Dialpad redirects back to: /auth/dialpad/callback?code={code}&state={state}
   └─> CTI exchanges code for access/refresh tokens

C. Tokens Stored in CTI Database
   ├─> INSERT INTO dialpad_connections:
   │   ├─ app_id: {client app id}
   │   ├─ dialpad_org_id: {Dialpad organization id}
   │   ├─ access_token: {Dialpad access token}
   │   ├─ refresh_token: {Dialpad refresh token}
   │   └─ token_expires_at: {expiration timestamp}
   └─> Connection established ✓

Result: CTI server can now receive webhooks and make API calls on behalf of client
```

**Code Example (Client App):**

```javascript
// Client app redirects user to OAuth
window.location.href = `https://cti-server.com/auth/dialpad/connect?app_id=${APP_ID}`;

// After authorization completes, CTI server returns:
// { message: "Dialpad connected", app_id, environment }
```

### 3. Webhook Reception & Processing (Continuous)

```
Timeline: Real-time call events flow from Dialpad → CTI Server → Database

A. Dialpad Detects Event (Call Started, Message Received, etc.)
   ├─> Event occurs in Dialpad: user makes/receives call
   ├─> Dialpad creates JWT payload with event details
   ├─> Dialpad signs JWT with webhook secret
   └─> Dialpad sends: POST https://cti-server.com/webhooks/dialpad
       Content-Type: application/jwt
       Body: {jwt_token}

B. CTI Server Receives Webhook
   ├─> Express middleware captures raw body
   ├─> Middleware identifies: application/jwt content-type
   ├─> JWT decoded: extract payload from middle section
   ├─> Signature verified (using DIALPAD_WEBHOOK_SECRET)
   └─> Payload extracted:
       {
         "state": "connected",
         "call_id": 5963972419002368,
         "direction": "outbound",
         "external_number": "+13345521280",
         "internal_number": "+13342459504",
         "date_started": 1770243109824,
         "date_connected": 1770243113900,
         "date_ended": 1770243118807,
         "target": { "id": 5600409256689664, "type": "call_center" },
         "was_recorded": true,
         "talk_time": 5000,
         "mos_score": 4.41
       }

C. Store Raw Event
   ├─> INSERT INTO webhook_events:
   │   ├─ app_id: (resolved from dialpad_org_id via dialpad_connections)
   │   ├─ event_type: "connected" (from state field)
   │   ├─ dialpad_event_id: 5963972419002368 (call_id)
   │   ├─ payload: {full JWT payload as JSON}
   │   └─ processed: false
   └─> Event queued for processing

D. Event Processor (Runs Every 5 Seconds)
   ├─> SELECT * FROM webhook_events WHERE processed = false
   ├─> For each event:
   │   ├─> Call event handler extracts call details
   │   ├─> INSERT/UPDATE into calls table:
   │   │   {
   │   │     "call_id": 5963972419002368,
   │   │     "app_id": {app_uuid},
   │   │     "direction": "outbound",
   │   │     "from": "+13342459504",
   │   │     "to": "+13345521280",
   │   │     "status": "completed",
   │   │     "duration": 5000,
   │   │     "started_at": 2025-02-04T22:11:49.824Z,
   │   │     "ended_at": 2025-02-04T22:11:58.807Z,
   │   │     "recording_url": "https://dialpad.com/r/4713299887005696",
   │   │     "was_recorded": true,
   │   │     "mos_score": 4.41
   │   │   }
   │   ├─> Broadcast event via WebSocket (real-time)
   │   └─> UPDATE webhook_events SET processed = true
   └─> Event fully processed ✓

Result: Call data immediately available to client apps
```

### 4. Client App Queries Call Data (On-Demand)

```
Timeline: Client app retrieves processed call data

A. Client App Makes Request
   ├─> GET /api/calls?limit=50&offset=0
   ├─> Headers: x-app-api-key: {api_key}
   └─> Authentication: apiKeyAuth middleware validates key

B. CTI Server Queries Database
   ├─> SELECT * FROM calls
   │   WHERE app_id = {authenticated_app_id}
   │   AND created_at > NOW() - INTERVAL '24 hours'
   │   ORDER BY started_at DESC
   │   LIMIT 50
   └─> Filters by app_id for multi-tenant isolation

C. Response Returned
   ├─> Status: 200 OK
   └─> Body:
       {
         "calls": [
           {
             "id": "uuid-xxx",
             "call_id": 5963972419002368,
             "direction": "outbound",
             "from": "+13342459504",
             "to": "+13345521280",
             "status": "completed",
             "duration": 5000,
             "started_at": "2025-02-04T22:11:49.824Z",
             "ended_at": "2025-02-04T22:11:58.807Z",
             "recording_url": "https://dialpad.com/r/4713299887005696",
             "mos_score": 4.41
           },
           ...
         ],
         "total": 1847,
         "limit": 50,
         "offset": 0
       }

D. Client App Displays Data
   └─> Renders call history in user interface
```

---

## Client Application Setup

### Prerequisites

Client application needs:

1. **CTI Server Base URL**

   ```
   https://cti-server.com  (or IP:port for on-premise)
   ```

2. **API Key** (provided by CTI administrator)

   ```
   Store securely in environment variables:
   CTI_API_KEY=xxxx-xxxx-xxxx-xxxx
   ```

3. **App ID** (provided by CTI administrator)
   ```
   CTI_APP_ID=yyyy-yyyy-yyyy-yyyy
   ```

### Integration Steps

**Step 1: Add "Connect Dialpad" Button to Client App**

```javascript
// React example
function DialpadConnect() {
  const handleConnect = () => {
    const ctiBaseUrl = process.env.REACT_APP_CTI_SERVER;
    const appId = process.env.REACT_APP_CTI_APP_ID;

    window.location.href = `${ctiBaseUrl}/auth/dialpad/connect?app_id=${appId}`;
  };

  return <button onClick={handleConnect}>Connect Dialpad Account</button>;
}
```

**Step 2: Fetch Active Calls on Page Load**

```javascript
async function loadActiveCalls() {
  const ctiBaseUrl = process.env.REACT_APP_CTI_SERVER;
  const apiKey = process.env.REACT_APP_CTI_API_KEY;

  const response = await fetch(`${ctiBaseUrl}/api/calls/active`, {
    headers: {
      "x-app-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CTI error: ${response.status}`);
  }

  const data = await response.json();
  return data.calls; // Array of active call objects
}
```

**Step 3: Subscribe to Real-Time Updates (Optional - WebSocket)**

```javascript
function subscribeToCallEvents() {
  const wsUrl = process.env.REACT_APP_CTI_WS_SERVER;
  const socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);

    if (type === "call.started") {
      console.log("New call:", data);
      // Update UI with new call
    } else if (type === "call.ended") {
      console.log("Call ended:", data);
      // Remove/mark call as ended
    }
  };

  return socket;
}
```

**Step 4: Query Call History**

```javascript
async function getCallHistory(filters = {}) {
  const ctiBaseUrl = process.env.REACT_APP_CTI_SERVER;
  const apiKey = process.env.REACT_APP_CTI_API_KEY;

  const params = new URLSearchParams({
    limit: filters.limit || 50,
    offset: filters.offset || 0,
    direction: filters.direction || "all", // 'inbound', 'outbound', 'all'
    ...filters,
  });

  const response = await fetch(`${ctiBaseUrl}/api/calls?${params}`, {
    headers: { "x-app-api-key": apiKey },
  });

  return response.json();
}
```

---

## Webhook Processing Pipeline

### Event Flow Diagram

```
Dialpad Event → JWT Webhook → Decode → Verify → Store → Process → Database → API
    (occurs)     (HTTP POST)  (JWT)    (HMAC)   (queue)  (handler)  (insert)    (query)
       1             2          3        4        5        6          7          8

Time: ~0ms        ~5-10ms    ~1-2ms   ~1-2ms   ~2-5ms   ~100-500ms  ~5-10ms   Real-time
```

### Processing States

```
webhook_events table has `processed` flag:

FALSE → Waiting to be processed
  ├─> Reason: Just received from Dialpad
  ├─> Action: Event processor picks up next iteration
  └─> Timeout: If not processed in 1 hour, retry

TRUE → Processed successfully
  ├─> Reason: Event handler completed
  ├─> Action: Data available in calls/messages/voicemails tables
  └─> Status: Client can query this data

ARCHIVED → Older than 90 days
  ├─> Reason: Data retention policy
  ├─> Action: Move to cold storage (optional)
  └─> Status: Still queryable but slower
```

### Event Types Handled

```
Call Events (JWT payload.state):
├─> calling: Outbound call initiated
├─> ringing: Inbound call ringing
├─> connected: Call answered
├─> on_hold: Call placed on hold
├─> transfer_initiated: Call being transferred
├─> hangup: Call ended
└─> recap_summary: Final call summary with recordings/transcriptions

Message Events:
├─> sms.received: Inbound SMS
├─> sms.sent: Outbound SMS
├─> sms.delivered: SMS delivery confirmation
└─> message.read: Message marked read

Voicemail Events:
└─> voicemail.created: Voicemail left
```

---

## Sandbox vs Production

### NODE_ENV = "sandbox"

**Configuration:**

```env
NODE_ENV=sandbox
DIALPAD_SANDBOX_CLIENT_ID=G6m8nf6a5xjhjMpKJX8Z99M35
DIALPAD_SANDBOX_CLIENT_SECRET=vcPCPrsUvn8j3k8FZSNnxBaLu3DrzsArFhH87qHNDWGDXmLzKD
DIALPAD_SANDBOX_REDIRECT_URI=https://neutral-wasp-calm.ngrok-free.app/auth/dialpad/callback
DIALPAD_SANDBOX_BASE_URL=https://sandbox.dialpad.com
```

**Behavior:**

- Uses `sandbox.dialpad.com` OAuth endpoints
- Webhooks sent from Dialpad sandbox environment
- Test data only (no real customer calls)
- No billing impact
- Perfect for development and testing

**Example Flow:**

```
1. Client creates test app in Dialpad sandbox
2. Client initiates OAuth to sandbox
3. Test calls made in Dialpad sandbox
4. Webhooks received on ngrok tunnel
5. Data stored in development database
```

### NODE_ENV = "production"

**Configuration:**

```env
NODE_ENV=production
DIALPAD_PROD_CLIENT_ID=your-prod-client-id
DIALPAD_PROD_CLIENT_SECRET=your-prod-client-secret
DIALPAD_PROD_REDIRECT_URI=https://your-domain.com/auth/dialpad/callback
DIALPAD_PROD_BASE_URL=https://dialpad.com
```

**Behavior:**

- Uses `dialpad.com` production OAuth endpoints
- Webhooks received from real Dialpad accounts
- Production calls processed
- Database stores real customer data
- Billing applies based on API usage

**Differences from Sandbox:**

```
                 Sandbox              Production
────────────────────────────────────────────────
Base URL         sandbox.dialpad.com  dialpad.com
Webhook URL      ngrok tunnel         Production domain
Data             Test only            Real customer data
Availability     ~99%                 ~99.9%+
Support          Community            Premium support
Billing          None                 Per-call/message
```

### OAuth Endpoint Switching

The code automatically switches endpoints based on `NODE_ENV`:

```javascript
// From dialpadAuthController.js
const BASE_URLS = {
  sandbox:
    process.env.DIALPAD_SANDBOX_BASE_URL || "https://sandbox.dialpad.com",
  production: process.env.DIALPAD_PROD_BASE_URL || "https://dialpad.com",
};

const ENV = process.env.NODE_ENV === "production" ? "PROD" : "SANDBOX";
const CLIENT_ID = process.env[`DIALPAD_${ENV}_CLIENT_ID`];

// Automatically uses correct endpoints:
// Sandbox: oauth2/authorize on sandbox.dialpad.com
// Prod: oauth2/authorize on dialpad.com
```

---

## Production (Render) Owner Integration Guide

This section is a step-by-step guide for the owner when the CTI server is hosted on Render.

> Important: If the client is using a real (production) Dialpad app, `NODE_ENV` must be set to `production`. If `NODE_ENV=sandbox`, the server will call sandbox endpoints and production OAuth will fail.

### Step 1: Deploy CTI Server to Render

1. Create a new Render Web Service for this repository.
2. Set the build command (if needed): `npm install`.
3. Set the start command: `npm start` (or `node index.js`).
4. Deploy and note the public URL:
   - Example: `https://cti-server.onrender.com`

### Step 2: Configure Render Environment Variables

Set these environment variables in Render (Production):

```
NODE_ENV=production
PORT=4000

DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_SSL=true

DIALPAD_PROD_CLIENT_ID=...
DIALPAD_PROD_CLIENT_SECRET=...
DIALPAD_PROD_REDIRECT_URI=https://cti-server.onrender.com/auth/dialpad/callback
DIALPAD_PROD_BASE_URL=https://dialpad.com

DIALPAD_WEBHOOK_SECRET=...     # must match webhook secret in Dialpad
INTERNAL_API_SECRET=...        # internal admin endpoints
DIALPAD_SCOPES="webhook calls:list offline_access recordings_export"
```

### Step 3: Register the Production Redirect URI with Dialpad

Dialpad production apps require the redirect URI to be approved. Send the server URL to Dialpad support.

**Example message to Dialpad Support:**

```
Hello Dialpad Support,

Please whitelist the following OAuth redirect URI for our production Dialpad app:

https://cti-server.onrender.com/auth/dialpad/callback

This is the CTI server callback endpoint for our OAuth flow.

Thank you.
```

### Step 4: Create or Update the Dialpad Production App

1. Log in to the Dialpad Developer Portal.
2. Create a Production App (or open the existing one).
3. Set the Redirect URI to:
   - `https://cti-server.onrender.com/auth/dialpad/callback`
4. Copy the Client ID and Client Secret into Render environment variables.

### Step 5: Create the Webhook in Dialpad

**Request:**

- **Method:** POST
- **URL:** `https://dialpad.com/api/v2/webhooks`
- **Headers:** `Authorization: Bearer {access_token}`
- **Body:**

```
{
  "hook_url": "https://cti-server.onrender.com/webhooks/dialpad",
  "secret": "<DIALPAD_WEBHOOK_SECRET>"
}
```

Save the `id` as `webhook_id`. This is already stored by the server when webhooks are received.

### Step 6: Create Event Subscriptions

**Call Events:**

- **Method:** POST
- **URL:** `https://dialpad.com/api/v2/subscriptions/call`
- **Body:**

```
{
  "webhook_id": <webhook_id>,
  "call_states": ["ringing", "connected", "voicemail", "missed", "hangup"],
  "enabled": true
}
```

**SMS Events (Optional):**

- **Method:** POST
- **URL:** `https://dialpad.com/api/v2/subscriptions/sms`
- **Body:**

```
{
  "webhook_id": <webhook_id>,
  "direction": "all",
  "enabled": true,
  "status": true
}
```

### Step 7: Complete OAuth (Owner Connects Dialpad)

Open this URL in the owner’s browser:

```
https://cti-server.onrender.com/auth/dialpad/connect?app_id=<CTI_APP_ID>
```

After login and authorization, confirm a row exists in `dialpad_connections`.

### Step 8: Integrate Client App

Provide the client app with:

- `DIALPAD_PROD_REDIRECT_URI`: `https://cti-server.onrender.com`
- `CTI_APP_ID`: (from `/internal/apps`)
- `CTI_API_KEY`: (from `/internal/apps/{app_id}/api-key`)

Client app calls:

- `GET /api/calls`
- `GET /api/calls/active`
- `GET /api/messages`

### Step 9: Validate Webhook Processing

1. Place a test call in Dialpad.
2. Confirm webhook events are inserted in `webhook_events`.
3. Confirm `calls` records appear in `/api/calls`.

---

## Security Considerations

### 1. API Key Management

**Generation:**

```sql
-- Stored in database (bcrypt hashed)
INSERT INTO api_keys (app_id, api_key_hash, created_at)
VALUES (app_id, bcrypt_hash(generated_key), now());
```

**Usage:**

- Client includes in every API request header: `x-app-api-key`
- Server validates against bcrypt hash in database
- Never log or display full API key (one-time display at creation)
- Rotate regularly (90-day recommendation)

### 2. Multi-Tenant Isolation

**Data Isolation:**

```sql
-- Every query filtered by app_id
SELECT * FROM calls
WHERE app_id = {authenticated_app_id}
  AND created_at > NOW() - INTERVAL '30 days';
```

**Row-Level Security:**

- No cross-app data leakage
- Each app's data completely isolated
- API Key → App ID → Data Scope mapping

### 3. OAuth Token Security

**Refresh Token Rotation:**

```javascript
// Dialpad always returns new refresh token
const newRefreshToken = response.data.refresh_token;

// Store in database immediately
UPDATE dialpad_connections
SET refresh_token = $1
WHERE app_id = $2;
```

**Token Expiration:**

```javascript
// Tokens refresh automatically before expiry
const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

// Helper checks expiry, refreshes if needed
const validToken = await getValidAccessToken(app_id);
```

### 4. Webhook Signature Verification

**JWT Signature Check:**

```javascript
// Verify webhook came from Dialpad (not spoofed)
const expectedSignature = crypto
  .createHmac("sha256", WEBHOOK_SECRET)
  .update(`${headerB64}.${payloadB64}`)
  .digest("base64url");

if (expectedSignature !== receivedSignature) {
  return res.status(401).json({ error: "Invalid signature" });
}
```

### 5. HTTPS & Encryption

**Requirements:**

- All API endpoints: HTTPS only
- Webhook URL: HTTPS required by Dialpad
- Database: Encrypted connection (SSL/TLS)
- API Keys: Transmitted over HTTPS only
- Tokens: Never logged or exposed in errors

### 6. Rate Limiting

**Applied Globally:**

```javascript
// 1000 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
});
```

**Per Endpoint:**

- Webhook: High limit (Dialpad sends many events)
- API: Standard limit (client app queries)
- Auth: Stricter limit (prevent brute force)

---

## Example Client Application Architecture

```
┌─────────────────────────────────────┐
│    Client Application               │
├─────────────────────────────────────┤
│                                     │
│  UI Layer                           │
│  ├─ Call History Component          │
│  ├─ Active Calls Dashboard          │
│  ├─ Messaging Interface             │
│  └─ Dialpad Connection Status       │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  API Service Layer                  │
│  ├─ ctiService.js                   │
│  │  ├─ getActiveCalls()             │
│  │  ├─ getCallHistory()             │
│  │  ├─ getMessages()                │
│  │  └─ connectDialpad()             │
│  │                                  │
│  └─ WebSocketService.js             │
│     └─ subscribeToEvents()          │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  Configuration                      │
│  ├─ .env.local                      │
│  │  ├─ REACT_APP_CTI_SERVER         │
│  │  ├─ REACT_APP_CTI_API_KEY        │
│  │  └─ REACT_APP_CTI_APP_ID         │
│  │                                  │
│  └─ constants.js                    │
│     └─ API endpoints                │
│                                     │
└─────────────────────────────────────┘
         │
         │ HTTP/WebSocket
         │
    CTI Server (this project)
```

---

## Troubleshooting Integration

### Issue: Webhooks Not Arriving

**Check:**

1. Is ngrok/tunnel URL correct in Dialpad webhook settings?
2. Is NODE_ENV matching the Dialpad app environment (sandbox/prod)?
3. Are subscriptions created for call/SMS events in Dialpad?

**Solution:**

```bash
# Verify webhook URL is reachable
curl -X POST https://your-webhook-url/webhooks/dialpad \
  -H "Content-Type: application/jwt" \
  -d "test-jwt-payload"

# Check CTI server logs
tail -f logs/cti-server.log | grep "Webhook received"
```

### Issue: "Unknown app" Errors

**Check:**

```sql
SELECT * FROM dialpad_connections
WHERE dialpad_org_id = {the_org_id_from_error};
```

**Solution:**

- Complete OAuth flow first (connect Dialpad account)
- Ensure `dialpad_org_id` from webhook matches database record

### Issue: API Key Validation Failures

**Check:**

1. Is API Key included in request header?
2. Is header name exactly `x-app-api-key`?
3. Is API Key correct (no extra spaces)?

**Solution:**

```javascript
// Correct
fetch("...", {
  headers: {
    "x-app-api-key": "xxxx-xxxx-xxxx-xxxx",
  },
});

// Incorrect
fetch("...", {
  headers: {
    "X-App-Api-Key": "... ", // Wrong case, extra space
  },
});
```

---

## Next Steps

1. **For CTI Administrators:**
   - Register client apps: `POST /internal/apps`
   - Generate API keys for each client
   - Configure webhook subscriptions in Dialpad
   - Monitor event processing via logs and database

2. **For Client Developers:**
   - Implement OAuth connection flow
   - Build UI components for call history
   - Subscribe to real-time events via WebSocket
   - Query call/message data via REST API

3. **For Production Deployment:**
   - Switch NODE_ENV to `production`
   - Update Dialpad app credentials (prod vs sandbox)
   - Configure production webhook URL (real domain)
   - Enable SSL/TLS on all endpoints
   - Set up monitoring and alerting

---

## API Reference

See [CALLS_API_DOCUMENTATION.md](CALLS_API_DOCUMENTATION.md) for full endpoint reference.

Quick endpoints:

| Method | Endpoint                            | Purpose                    |
| ------ | ----------------------------------- | -------------------------- |
| GET    | `/api/calls`                        | List calls with filters    |
| GET    | `/api/calls/active`                 | Get currently active calls |
| GET    | `/api/calls/{id}`                   | Get single call details    |
| GET    | `/api/messages`                     | List messages/SMS          |
| GET    | `/auth/dialpad/connect?app_id={id}` | Initiate OAuth             |
| POST   | `/internal/apps`                    | Create app (admin)         |
| POST   | `/internal/apps/{id}/api-key`       | Generate API key (admin)   |
