# CTI Server Production Workflow

Complete end-to-end workflow for backend systems integrating with the CTI Server in production environments.

---

## Table of Contents

1. [Initial Setup & Registration](#initial-setup--registration)
2. [OAuth Authorization Flow](#oauth-authorization-flow)
3. [Call Event Processing](#call-event-processing)
4. [Voicemail Handling](#voicemail-handling)
5. [Outbound Call Tracking](#outbound-call-tracking)
6. [Real-Time Updates via WebSocket](#real-time-updates-via-websocket)
7. [Error Handling & Recovery](#error-handling--recovery)
8. [Production Checklist](#production-checklist)

---

## Initial Setup & Registration

### Overview

Before your backend can interact with Dialpad, you must register your application with the CTI Server and obtain credentials.

### Step 1: Create App Record

**Endpoint:** `POST /internal/apps`

**Authentication:** Bearer token (use `INTERNAL_API_SECRET`)

**Request:**

```bash
curl -X POST http://your-cti-server.com/internal/apps \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My CRM Backend"
  }'
```

**Response (200 OK):**

```json
{
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "api_key": "raw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "message": "App created successfully. SAVE THE API KEY - it will not be shown again."
}
```

⚠️ **Critical:** Store the `api_key` securely. This is the ONLY time you'll see it. If lost, you must regenerate via `POST /internal/apps/{app_id}/api-key`.

### Step 2: Store Credentials

Save these values in your backend's secure configuration:

```env
CTI_APP_ID=550e8400-e29b-41d4-a716-446655440000
CTI_API_KEY=raw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
DIALPAD_PROD_REDIRECT_URI=https://your-cti-server.com
```

---

## OAuth Authorization Flow

### Overview

Your backend must authorize the CTI Server to access Dialpad on behalf of your user's organization.

### Flow Diagram

```
┌─────────────────┐
│  Your Backend   │
└────────┬────────┘
         │ 1. GET /authorize?app_id=550e8400...
         ↓
┌─────────────────┐
│  CTI Server     │
└────────┬────────┘
         │ 2. Redirect to Dialpad OAuth
         ↓
┌─────────────────┐
│  Dialpad OAuth  │
└────────┬────────┘
         │ 3. User approves scopes
         ↓
┌─────────────────┐
│  CTI Server     │
└────────┬────────┘
         │ 4. POST /callback with tokens
         │ 5. Tokens stored in DB
         ↓
┌─────────────────┐
│  Your Backend   │  ← Ready to use APIs!
└─────────────────┘
```

### Step 1: Initiate Authorization

Your backend redirects the user to the authorize endpoint:

```javascript
// Your backend (Node.js example)
app.get("/connect-dialpad", (req, res) => {
  const app_id = process.env.CTI_APP_ID;
  const authorizeUrl = `${process.env.DIALPAD_PROD_REDIRECT_URI}/authorize?app_id=${app_id}`;
  res.redirect(authorizeUrl);
});
```

**What CTI Server Does:**

1. Validates app exists and is active
2. Generates PKCE challenge (OAuth security)
3. Redirects user to Dialpad's OAuth screen with `client_id`, `scopes`, etc.
4. Stores PKCE verifier in session

### Step 2: User Approves Scopes

User logs into Dialpad and approves scopes:

- `calls:list` - Read call history
- `recordings_export` - Get recording URLs
- `offline_access` - Refresh token capability

### Step 3: Dialpad Redirects Back

Dialpad redirects to your CTI Server's callback endpoint with authorization `code`.

**What CTI Server Does:**

1. Verifies state parameter (CSRF protection)
2. Exchanges `code` for `access_token` + `refresh_token` using PKCE verifier
3. Stores tokens in `dialpad_connections` table with `app_id`
4. Returns success response

**Backend receives response:**

```json
{
  "message": "Dialpad connected",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "environment": "sandbox"
}
```

### Step 4: Verify Connection

Your backend can verify the connection is ready:

```bash
curl -H "x-api-key: raw_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6" \
  http://your-cti-server.com/status
```

Response:

```json
{
  "message": "App is connected to Dialpad",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "connected": true,
  "dialpad_org_id": 12345678,
  "environment": "sandbox"
}
```

---

## Call Event Processing

### Overview

Dialpad sends real-time call events to your CTI Server via webhooks. Your backend polls or subscribes to receive updates.

### Architecture

```
┌──────────────┐
│   Dialpad    │ (call.ring, call.started, call.ended events)
└──────┬───────┘
       │ Webhook POST /webhooks
       ↓
┌──────────────────────┐
│  CTI Server          │
│  webhook_events      │ (stores raw event)
│  table               │
└──────┬───────────────┘
       │ Event Processor (every 5 seconds)
       │ matches event_type → handler
       ↓
┌──────────────────────┐
│  CTI Server          │
│  calls table         │ (creates/updates call record)
│  messages table      │
│  voicemails table    │
└──────┬───────────────┘
       │ (optional) WebSocket notification
       ↓
┌──────────────┐
│ Your Backend │ (subscribes via WS or polls API)
└──────────────┘
```

### Call Event Types

| Event                | Trigger                      | Action                                   |
| -------------------- | ---------------------------- | ---------------------------------------- |
| `call.ring`          | Call incoming, before answer | Create call record with status "ringing" |
| `call.started`       | Call answered                | Update status to "active"                |
| `call.held`          | User places call on hold     | Update status to "held"                  |
| `call.resumed`       | User resumes held call       | Update status to "active"                |
| `call.ended`         | Call disconnected            | Update status "ended", record duration   |
| `voicemail.received` | Voicemail left               | Create voicemail record                  |

### Webhook Payload Example

**Incoming from Dialpad (to your CTI Server):**

```json
{
  "event_type": "call.ring",
  "call_id": 9876543210,
  "direction": "inbound",
  "from_number": "+14155551234",
  "to_number": "+14155555678",
  "dialpad_user_id": 555,
  "timestamp": 1704067200,
  "organization_id": 12345678,
  "raw_payload": {
    "event": "call.ring",
    "call": {
      "id": 9876543210,
      "direction": "INBOUND",
      "from_number": "+14155551234",
      "to_number": "+14155555678",
      "user_id": 555,
      "created_at": "2024-01-01T12:00:00Z"
    }
  }
}
```

### Backend: Option 1 - WebSocket Subscription

Your backend subscribes to real-time call events:

```javascript
// Node.js example using ws library
const ws = new WebSocket(
  "wss://your-cti-server.com/ws?api_key=raw_a1b2c3d4e5f6...",
);

ws.on("message", (data) => {
  const event = JSON.parse(data);

  switch (event.type) {
    case "call.ring":
      // Incoming call - ring phone, log to CRM
      console.log(`Ringing: ${event.from_number} → ${event.to_number}`);
      updateCRMWithIncomingCall(event);
      break;

    case "call.started":
      // Call answered - start recording, update status
      console.log(`Call active: ${event.call_id}`);
      startCallTimer(event.call_id);
      break;

    case "call.ended":
      // Call finished - calculate duration, save to history
      console.log(
        `Call ended: ${event.call_id}, duration: ${event.duration_seconds}s`,
      );
      saveCallToHistory(event);
      break;
  }
});

function updateCRMWithIncomingCall(event) {
  // Lookup contact by from_number
  const contact = CRM.findContactByPhone(event.from_number);

  // Create activity in CRM
  CRM.createActivity({
    type: "call",
    status: "ringing",
    contact_id: contact.id,
    from: event.from_number,
    to: event.to_number,
    cti_call_id: event.call_id,
    timestamp: new Date(),
  });
}
```

### Backend: Option 2 - Polling API

Alternatively, poll the CTI Server for active/recent calls:

```javascript
async function pollForCalls() {
  const apiKey = process.env.CTI_API_KEY;

  const response = await fetch("https://your-cti-server.com/api/calls/active", {
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const activeCalls = await response.json();

  activeCalls.forEach((call) => {
    const lastSeen = callTracker.get(call.id);

    if (!lastSeen) {
      // New call
      onNewCall(call);
    } else if (call.status !== lastSeen.status) {
      // Status changed
      onCallStatusChanged(call, lastSeen.status);
    }

    callTracker.set(call.id, call);
  });
}

function onNewCall(call) {
  console.log(
    `New ${call.direction} call: ${call.from_number} → ${call.to_number}`,
  );
  // Log to CRM, trigger notification, etc.
}

function onCallStatusChanged(call, previousStatus) {
  console.log(`Call ${call.id}: ${previousStatus} → ${call.status}`);

  if (call.status === "ended") {
    console.log(`Duration: ${call.duration_seconds} seconds`);
    // Save to history, trigger follow-up, etc.
  }
}

// Poll every 2 seconds
setInterval(pollForCalls, 2000);
```

### Backend: Option 3 - Hybrid (WebSocket + API Fallback)

```javascript
// Subscribe to real-time events
subscribeToWebSocket();

// Fallback: Periodically verify state
setInterval(async () => {
  const apiCalls = await getCalls();
  const wsKnownCalls = getWebSocketKnownCalls();

  // Check for missed events
  const missed = apiCalls.filter(
    (call) => !wsKnownCalls.find((c) => c.id === call.id),
  );

  missed.forEach((call) => {
    console.warn(`Missed event for call ${call.id}, syncing...`);
    onCallStatusChanged(call);
  });
}, 30000); // Every 30 seconds
```

### Call Lifecycle Example

```
Timeline:

T+0s    : Incoming call from +1-415-555-1234
          Event: call.ring
          Status: ringing
          Action: Phone rings, CRM shows "incoming call"

T+3s    : User answers
          Event: call.started
          Status: active
          Action: Start call timer, update CRM to "active"

T+45s   : User puts call on hold
          Event: call.held
          Status: held
          Action: Update CRM status to "on hold"

T+50s   : User resumes call
          Event: call.resumed
          Status: active
          Action: Resume call timer

T+180s  : User hangs up
          Event: call.ended
          Status: ended
          Duration: 180 seconds
          Recording URL: https://dialpad.com/recordings/call123.wav
          Action: Stop timer, save to call history, create follow-up tasks
```

---

## Voicemail Handling

### Overview

When a call goes to voicemail, Dialpad records the message and sends a `voicemail.received` event to your CTI Server.

### Voicemail Event Flow

```
┌──────────────┐
│   Dialpad    │
│ (call unanswered)
└──────┬───────┘
       │ Message recorded
       │ Event: voicemail.received
       ↓
┌──────────────────────┐
│  CTI Server          │
│  /webhooks           │ (receives event)
└──────┬───────────────┘
       │ Extracts voicemail details
       │ Fetches recording from Dialpad
       ↓
┌──────────────────────┐
│  CTI Server          │
│  voicemails table    │ (stores metadata + transcript)
│  calls table         │ (updates call with voicemail flag)
└──────┬───────────────┘
       │
       ↓
┌──────────────┐
│ Your Backend │ (WebSocket notification or API call)
└──────────────┘
       │
       │ Option A: Fetch recording + transcript
       │ Option B: Store URL, stream on demand
       │
       ↓
┌──────────────┐
│ Your CRM     │ (create voicemail activity)
└──────────────┘
```

### Voicemail Webhook Payload

**Incoming from Dialpad:**

```json
{
  "event_type": "voicemail.received",
  "call_id": 9876543210,
  "voicemail_id": "vm_123456",
  "from_number": "+14155551234",
  "to_number": "+14155555678",
  "dialpad_user_id": 555,
  "recording_url": "https://dialpad.com/api/v2/recordings/call123/download",
  "transcript": "Hi, this is John from Acme Corp. Please call me back at 555-0100. Thanks!",
  "duration_seconds": 28,
  "timestamp": 1704067260,
  "organization_id": 12345678
}
```

### Backend: Process Voicemail

```javascript
async function handleVoicemail(event) {
  const {
    call_id,
    from_number,
    to_number,
    dialpad_user_id,
    recording_url,
    transcript,
    duration_seconds,
  } = event;

  // 1. Look up contact
  const contact = CRM.findContactByPhone(from_number);
  if (!contact) {
    console.log(`Unknown caller: ${from_number}`);
    return;
  }

  // 2. Option A: Store recording locally
  const recordingPath = await downloadRecording(recording_url);

  // 3. Create voicemail activity in CRM
  const voicemailActivity = CRM.createActivity({
    type: "voicemail",
    contact_id: contact.id,
    from_number,
    to_number,
    recording_path: recordingPath,
    transcript,
    duration_seconds,
    received_at: new Date(event.timestamp * 1000),
    status: "new",
  });

  // 4. Create follow-up task
  CRM.createTask({
    title: `Call back ${contact.name}`,
    description: `Voicemail: "${transcript}"`,
    assigned_to: getUserForNumber(to_number),
    due_date: new Date(),
    priority: "high",
    related_activity_id: voicemailActivity.id,
  });

  // 5. Send notification to user
  const user = getUserForNumber(to_number);
  notifyUser(user, {
    type: "voicemail",
    from: contact.name,
    preview: transcript.substring(0, 100),
    duration: `${duration_seconds}s`,
  });

  console.log(`Voicemail logged: ${contact.name} (${duration_seconds}s)`);
}

async function downloadRecording(recordingUrl) {
  const response = await fetch(recordingUrl, {
    headers: {
      Authorization: `Bearer ${dialpadAccessToken}`,
    },
  });

  const buffer = await response.arrayBuffer();
  const filename = `voicemail_${Date.now()}.wav`;
  const filepath = `/storage/voicemails/${filename}`;

  fs.writeFileSync(filepath, buffer);
  return filepath;
}

function getUserForNumber(phoneNumber) {
  // Match phone number to user in your system
  const user = CRM.queryUsers({ phone: phoneNumber });
  return user || CRM.getDefaultVoicemailHandler();
}

function notifyUser(user, voicemailInfo) {
  // Send email, SMS, or push notification
  if (user.preferences.notifications === "email") {
    sendEmail(user.email, {
      subject: `New voicemail from ${voicemailInfo.from}`,
      body: `<p>${voicemailInfo.preview}...</p><p>Duration: ${voicemailInfo.duration}</p>`,
    });
  } else {
    sendPushNotification(user, voicemailInfo);
  }
}
```

### Backend: Option B - Stream Recording On Demand

Instead of downloading all recordings, store the URL and stream when user clicks:

```javascript
// Handle voicemail received
async function handleVoicemail(event) {
  CRM.createActivity({
    type: "voicemail",
    contact_id: contact.id,
    recording_url: event.recording_url, // Store URL, don't download
    transcript: event.transcript,
    status: "new",
  });
}

// When user wants to listen
app.get("/voicemail/:id/play", (req, res) => {
  const voicemail = CRM.getVoicemail(req.params.id);

  // Proxy the recording from Dialpad with auth
  fetch(voicemail.recording_url, {
    headers: {
      Authorization: `Bearer ${dialpadAccessToken}`,
    },
  }).pipe(res);
});
```

### Voicemail Table Schema

```sql
CREATE TABLE voicemails (
  id UUID PRIMARY KEY,
  app_id UUID NOT NULL REFERENCES apps(id),
  dialpad_call_id BIGINT,
  dialpad_user_id BIGINT,
  from_number TEXT,
  to_number TEXT,
  recording_url TEXT,
  transcript TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

---

## Outbound Call Tracking

### Overview

Your backend initiates a call via Dialpad, then tracks it through the CTI Server.

### Flow

```
Your Backend → Dialpad API (place call) → Dialpad rings user
                                              ↓
                                         User answers
                                              ↓
                                         Dialpad → CTI Server (call.started event)
                                              ↓
                                         Your Backend (via WebSocket/API)
```

### Implementation

```javascript
// 1. Your backend uses Dialpad API directly to initiate call
async function initiateOutboundCall(contactPhone, dialpadUserId) {
  const dialpadToken = await getValidAccessToken();

  const response = await fetch("https://dialpad.com/api/v2/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dialpadToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: dialpadUserId,
      to_phone_number: contactPhone,
      hangup_on_disconnect: false,
    }),
  });

  const callData = await response.json();
  const dialpadCallId = callData.id;

  // 2. Create record in CRM with pending status
  const crmCall = CRM.createCall({
    dialpad_call_id: dialpadCallId,
    contact_phone: contactPhone,
    dialpad_user_id: dialpadUserId,
    direction: "outbound",
    status: "initiated",
    initiated_at: new Date(),
  });

  return crmCall;
}

// 3. Listen for status updates from CTI Server
ws.on("message", (data) => {
  const event = JSON.parse(data);

  if (event.dialpad_call_id === dialpadCallId) {
    switch (event.type) {
      case "call.started":
        CRM.updateCall(dialpadCallId, {
          status: "active",
          answered_at: new Date(),
        });
        break;

      case "call.ended":
        CRM.updateCall(dialpadCallId, {
          status: "completed",
          ended_at: new Date(),
          duration_seconds: event.duration_seconds,
        });
        break;
    }
  }
});
```

---

## Real-Time Updates via WebSocket

### Connection

Your backend connects once and receives all events for its app:

```javascript
const WebSocket = require("ws");

const ws = new WebSocket("wss://your-cti-server.com/ws", {
  headers: {
    "x-api-key": process.env.CTI_API_KEY,
  },
});

ws.on("open", () => {
  console.log("Connected to CTI Server");
});

ws.on("message", (data) => {
  const event = JSON.parse(data);
  handleEvent(event);
});

ws.on("close", () => {
  console.log("Disconnected - attempting reconnect in 5s");
  setTimeout(connectWebSocket, 5000);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});
```

### Message Types

```javascript
// call.started
{
  type: 'call.started',
  call_id: 9876543210,
  direction: 'inbound',
  from_number: '+1-415-555-1234',
  to_number: '+1-415-555-5678',
  dialpad_user_id: 555,
  started_at: '2024-01-01T12:00:03Z',
  recording_url: 'https://dialpad.com/recordings/call123.wav'
}

// call.held
{
  type: 'call.held',
  call_id: 9876543210,
  held_at: '2024-01-01T12:00:45Z'
}

// call.ended
{
  type: 'call.ended',
  call_id: 9876543210,
  ended_at: '2024-01-01T12:03:00Z',
  duration_seconds: 180,
  recording_url: 'https://dialpad.com/recordings/call123.wav'
}

// voicemail.received
{
  type: 'voicemail.received',
  call_id: 9876543210,
  from_number: '+1-415-555-1234',
  recording_url: 'https://dialpad.com/recordings/vm456.wav',
  transcript: 'Hi, please call me back',
  duration_seconds: 28
}
```

---

## Error Handling & Recovery

### API Errors

**401 Unauthorized - Invalid API Key**

```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

→ Solution: Check `CTI_API_KEY` is correctly stored and hasn't been rotated.

**403 Forbidden - App Inactive**

```json
{
  "error": "App is not active",
  "code": "APP_INACTIVE"
}
```

→ Solution: Re-run OAuth flow to reconnect to Dialpad.

**503 Service Unavailable - Dialpad API Down**

```json
{
  "error": "Failed to exchange code for tokens",
  "details": "Connection timeout"
}
```

→ Solution: Implement exponential backoff retry (3-5 attempts).

### Webhook Delivery Failures

**Scenario:** Your CTI Server is unreachable when Dialpad sends a webhook.

**Solution:**

1. Dialpad retries webhook up to 5 times
2. CTI Server queues event in `webhook_events` table
3. Event processor polls every 5 seconds
4. Once processed, event is marked as handled
5. Backend can query `/api/calls` to backfill missing events

```javascript
// Backfill missing events
async function syncMissingCalls() {
  const lastSyncTime = getLastSyncTimestamp();

  const response = await fetch(
    `https://your-cti-server.com/api/calls?since=${lastSyncTime}`,
    {
      headers: { "x-api-key": process.env.CTI_API_KEY },
    },
  );

  const calls = await response.json();
  calls.forEach((call) => {
    if (!callTracker.has(call.id)) {
      console.log(`Synced missing call: ${call.id}`);
      processCall(call);
    }
  });

  updateLastSyncTimestamp(Date.now());
}

setInterval(syncMissingCalls, 60000); // Every minute
```

### Token Expiration

**Scenario:** Dialpad access token expires.

**Solution:** CTI Server automatically refreshes tokens. Your backend doesn't need to handle this. If refresh fails:

```json
{
  "error": "OAuth tokens expired and refresh failed",
  "code": "TOKENS_EXPIRED"
}
```

→ User must re-authorize via GET `/authorize?app_id=...`

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === "OPEN") {
      throw new Error("Circuit breaker OPEN - service unavailable");
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = "OPEN";
      console.warn("Circuit breaker OPEN - waiting before retry");
      setTimeout(() => {
        this.state = "HALF_OPEN";
      }, this.timeout);
    }
  }
}

const breaker = new CircuitBreaker();

async function callCTIAPI() {
  return breaker.execute(() => fetch("https://your-cti-server.com/api/calls"));
}
```

---

## Production Checklist

### Pre-Deployment

- [ ] **Credentials Secured**
  - [ ] `CTI_API_KEY` stored in secrets manager (not Git)
  - [ ] `CTI_APP_ID` stored in configuration
  - [ ] Dialpad access token refresh tested

- [ ] **Database**
  - [ ] PostgreSQL 12+ running and accessible
  - [ ] DB_Schema.sql applied successfully
  - [ ] Indexes created (verified with `\di`)
  - [ ] Backups configured

- [ ] **OAuth Flow**
  - [ ] Tested full OAuth flow in sandbox
  - [ ] Redirect URI matches Dialpad console
  - [ ] HTTPS enforced in production

- [ ] **Webhooks**
  - [ ] Dialpad webhook URL configured to your CTI Server
  - [ ] HMAC signature validation tested
  - [ ] Webhook secret stored in `.env`

- [ ] **API Keys**
  - [ ] API key rotation tested (`POST /internal/apps/{app_id}/api-key`)
  - [ ] Old keys invalidated immediately

- [ ] **Error Handling**
  - [ ] Retry logic implemented for timeouts
  - [ ] Circuit breaker for cascading failures
  - [ ] Logging captures all errors with context

- [ ] **Monitoring**
  - [ ] GET `/health` endpoint monitored
  - [ ] GET `/metrics` endpoint ingested into monitoring system
  - [ ] Alerts configured for high error rates
  - [ ] Database connection pool monitored

### Post-Deployment

- [ ] Test end-to-end call flow
  - [ ] Place inbound test call
  - [ ] Verify call record created in 5 seconds
  - [ ] Leave voicemail, verify transcript stored
- [ ] Verify all endpoints
  - [ ] `GET /` returns 200
  - [ ] `GET /health` shows healthy
  - [ ] `GET /status` shows connected
  - [ ] `GET /api/calls` returns results
  - [ ] WebSocket `/ws` accepts connections

- [ ] Test token refresh
  - [ ] Wait for token expiration (or mock)
  - [ ] Verify automatic refresh occurs
  - [ ] No API disruption during refresh

- [ ] Test failure scenarios
  - [ ] Dialpad API down → Verify fallback to cached tokens
  - [ ] CTI Server down → Verify Dialpad queues webhooks
  - [ ] Database down → Verify graceful error responses

### Ongoing Operations

- [ ] **Daily:**
  - [ ] Check error logs for failures
  - [ ] Monitor webhook processing lag
  - [ ] Check API response times

- [ ] **Weekly:**
  - [ ] Review API key audit log for unexpected rotations
  - [ ] Clean up orphaned sessions
  - [ ] Verify backups completed

- [ ] **Monthly:**
  - [ ] Rotate `INTERNAL_API_SECRET`
  - [ ] Review and update OAuth scopes if needed
  - [ ] Capacity planning (database growth)

---

## Example: Complete Inbound Call Flow

```javascript
// ============================================
// COMPLETE INBOUND CALL WORKFLOW
// ============================================

// 1. User calls your company number
// 2. Dialpad receives call, sends webhook

app.post("/webhooks", async (req, res) => {
  const event = req.body;
  // CTI Server validates HMAC, stores in webhook_events
  res.json({ success: true });
});

// 3. Every 5 seconds, event processor runs
async function processEvent(event) {
  if (event.event_type === "call.ring") {
    // Insert into calls table
    const call = await insertCall({
      app_id: event.app_id,
      dialpad_call_id: event.call_id,
      direction: event.direction,
      from_number: event.from_number,
      to_number: event.to_number,
      status: "ringing",
    });
  }
}

// 4. Your backend receives WebSocket notification
ws.on("message", (data) => {
  const event = JSON.parse(data);

  if (event.type === "call.ring") {
    // OPTION A: Ring phone
    phone.ring({
      from: event.from_number,
      contactName: lookupContact(event.from_number).name,
    });

    // OPTION B: Notify via UI
    io.to(userRoom).emit("incoming_call", {
      from: event.from_number,
      to: event.to_number,
      call_id: event.call_id,
    });
  }
});

// 5. User answers
// 6. Dialpad sends call.started event
ws.on("message", (data) => {
  const event = JSON.parse(data);

  if (event.type === "call.started") {
    // Update CRM call record to "active"
    CRM.updateCall(event.call_id, {
      status: "active",
      answered_by: getCurrentUser(),
      answered_at: new Date(),
    });

    // Start call timer in UI
    io.to(userRoom).emit("call_connected", { call_id: event.call_id });
  }
});

// 7. Call ends (user hangs up or caller hangs up)
ws.on("message", (data) => {
  const event = JSON.parse(data);

  if (event.type === "call.ended") {
    // Record final details
    CRM.updateCall(event.call_id, {
      status: "completed",
      ended_at: new Date(),
      duration_seconds: event.duration_seconds,
      recording_url: event.recording_url,
    });

    // Create follow-up task
    CRM.createTask({
      title: `Follow up with ${event.from_number}`,
      type: "follow_up",
      related_call_id: event.call_id,
    });

    // Notify UI call ended
    io.to(userRoom).emit("call_ended", {
      call_id: event.call_id,
      duration: event.duration_seconds,
    });
  }
});

// 8. IF caller left voicemail
ws.on("message", (data) => {
  const event = JSON.parse(data);

  if (event.type === "voicemail.received") {
    // Create voicemail record
    const voicemail = CRM.createVoicemail({
      call_id: event.call_id,
      from_number: event.from_number,
      recording_url: event.recording_url,
      transcript: event.transcript,
      duration: event.duration_seconds,
    });

    // Create follow-up task with voicemail preview
    CRM.createTask({
      title: `Callback: ${event.from_number}`,
      description: `Voicemail: "${event.transcript.substring(0, 100)}"`,
      priority: "high",
      related_voicemail_id: voicemail.id,
    });

    // Notify user
    sendPushNotification({
      title: "New Voicemail",
      body: event.from_number,
      action: "open_voicemail",
    });
  }
});

// Result: Call fully tracked in CRM with recording, transcript, and follow-ups!
```

---

## Support & Troubleshooting

**Issue:** Webhooks not arriving
→ Check: Is ngrok/tunnel active? Is webhook URL correct in Dialpad console?

**Issue:** Events processed slowly
→ Check: Event processor logs. May be rate-limited by Dialpad API.

**Issue:** Voicemail transcript missing
→ Check: Did user approve `recordings_export` scope? Can call `/api/calls/{id}` to retry fetch.

**Issue:** WebSocket keeps disconnecting
→ Check: Implement exponential backoff reconnect. Network may be unstable.

For detailed endpoint documentation, see [CTI_SERVER_API.md](CTI_SERVER_API.md).

For architecture diagrams, see [CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md).
