# Extensions Architecture Diagram

## High-Level System Overview

```
╔═════════════════════════════════════════════════════════════════════════════╗
║                        DIALPAD CTI BACKEND SYSTEM                           ║
╚═════════════════════════════════════════════════════════════════════════════╝

                                EXTERNAL CLIENTS
                              ┌──────────────────┐
                              │  Base44 Frontend │
                              │   (React App)    │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
             (1) OAuth     (2) API Key       (3) WebSocket
                    │                  │                  │
                    ↓                  ↓                  ↓
          ┌──────────────┐  ┌────────────────┐  ┌──────────────┐
          │ /auth/dialpad│  │  /api/calls    │  │  /ws         │
          │   (Connect)  │  │  (REST + Auth) │  │  (Real-time) │
          └──────┬───────┘  └────────┬───────┘  └──────┬───────┘
                 │                   │                 │
                 │                   │                 │
╔════════════════╩═══════════════════╩═════════════════╩═══════════════════════╗
║                                                                               ║
║                          EXPRESS.JS SERVER                                   ║
║                                                                               ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ INTERNAL ROUTES (/internal) - SANDBOX-SAFE ADMINISTRATION              │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────────────────────────────────────────────────┐  │  ║
║  │  │ API Key Management                                               │  │  ║
║  │  │  POST   /apps/:app_id/api-key              → generate/rotate     │  │  ║
║  │  │  POST   /apps/:app_id/api-key/revoke       → revoke access       │  │  ║
║  │  │  GET    /apps/:app_id/api-key/status       → check status        │  │  ║
║  │  │  GET    /apps/:app_id/api-key/audit        → view history        │  │  ║
║  │  └──────────────────────────────────────────────────────────────────┘  │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────────────────────────────────────────────────┐  │  ║
║  │  │ Voicemail Management                                             │  │  ║
║  │  │  GET    /apps/:app_id/voicemails           → list with filters   │  │  ║
║  │  │  GET    /apps/:app_id/voicemails/:id       → get single          │  │  ║
║  │  │  DELETE /apps/:app_id/voicemails/:id       → delete              │  │  ║
║  │  └──────────────────────────────────────────────────────────────────┘  │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────────────────────────────────────────────────┐  │  ║
║  │  │ User Mapping (Dialpad → CRM)                                     │  │  ║
║  │  │  POST   /apps/:app_id/users/map            → create/update       │  │  ║
║  │  │  GET    /apps/:app_id/users/mappings       → list all            │  │  ║
║  │  │  POST   /apps/:app_id/users/batch-map      → bulk sync           │  │  ║
║  │  │  DELETE /apps/:app_id/users/mappings/:id   → delete              │  │  ║
║  │  └──────────────────────────────────────────────────────────────────┘  │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ PUBLIC ROUTES                                                          │  ║
║  │                                                                         │  ║
║  │  POST   /webhooks/dialpad      → Receive Dialpad events (signature)    │  ║
║  │  GET    /api/calls             → List calls (API key auth)             │  ║
║  │  GET    /api/calls/:id         → Get single call                       │  ║
║  │  GET    /api/calls/active      → Get active calls                      │  ║
║  │  GET/POST /auth/dialpad/*      → OAuth flow                            │  ║
║  │  GET    /                      → Health check                          │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │ BUSINESS LOGIC SERVICES                                                │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────┐  ┌──────────────────────┐                   │  ║
║  │  │ dialpadEventProcessor │  │ callEventHandlers    │                   │  ║
║  │  │ (Polling engine)      │  │ (Event dispatch)     │                   │  ║
║  │  │ - Polls every 5s      │  │ - call.started       │                   │  ║
║  │  │ - Batch processing    │  │ - call.ring          │                   │  ║
║  │  │ - Handler dispatch    │  │ - call.ended         │                   │  ║
║  │  │ - Row-level locking   │  │ - call.recording.    │                   │  ║
║  │  │                       │  │   completed          │                   │  ║
║  │  │                       │  │ - voicemail.received │                   │  ║
║  │  │                       │  │ - UPSERT logic       │                   │  ║
║  │  │                       │  │ - WebSocket broadcast│                   │  ║
║  │  └──────────────────────┘  └──────────────────────┘                   │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────┐  ┌──────────────────────┐                   │  ║
║  │  │ voicemailService     │  │ userMappingService   │                   │  ║
║  │  │ - upsertVoicemail()  │  │ - upsertMapping()    │                   │  ║
║  │  │ - getVoicemail()     │  │ - getMappingBy*()    │                   │  ║
║  │  │ - listVoicemails()   │  │ - batchUpsert()      │                   │  ║
║  │  │ - deleteVoicemail()  │  │ - deleteMapping()    │                   │  ║
║  │  └──────────────────────┘  └──────────────────────┘                   │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────────────────────────────────────────────────┐  │  ║
║  │  │ websocketManager                                                 │  │  ║
║  │  │ - initializeWebSocketServer(httpServer)                         │  │  ║
║  │  │ - broadcastToApp(app_id, event)                                 │  │  ║
║  │  │ - broadcastToUser(app_id, dialpad_user_id, event)               │  │  ║
║  │  │ - getAppConnectionCount(app_id)                                 │  │  ║
║  │  │ - Per-app isolated connection tracking                          │  │  ║
║  │  │ - Heartbeat mechanism (30s ping/pong)                           │  │  ║
║  │  └──────────────────────────────────────────────────────────────────┘  │  ║
║  │                                                                         │  ║
║  │  ┌──────────────────────┐  ┌──────────────────────┐                   │  ║
║  │  │ callsService         │  │ dialpadAuthController│                   │  ║
║  │  │ - listCalls()        │  │ - connect()          │                   │  ║
║  │  │ - getCallById()      │  │ - callback()         │                   │  ║
║  │  │ - getActiveCalls()   │  │ - getValid           │                   │  ║
║  │  │ - Tenant isolation   │  │   AccessToken()      │                   │  ║
║  │  └──────────────────────┘  └──────────────────────┘                   │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
                                      ↓
                            ┌──────────────────────┐
                            │  PostgreSQL Database │
                            └──────────────────────┘
                                      ↓
              ┌───────────────────────┼───────────────────────┐
              ↓                       ↓                       ↓
         ┌─────────┐           ┌──────────────┐        ┌──────────────┐
         │ calls   │           │ voicemails   │        │ app tables   │
         │ table   │           │ table        │        │              │
         │         │           │              │        │ - apps       │
         │ (calls  │           │ (first-class)│        │ - dialpad    │
         │ metadata│           │  entity)     │        │   _connections
         │ + user  │           │              │        │ - dialpad    │
         │ mapping)            │              │        │   _users     │
         └─────────┘           └──────────────┘        │ - dialpad    │
              ↓                       ↓                 │   _user_     │
         ┌─────────┐           ┌──────────────┐        │   _mappings  │
         │ webhook │           │ api_key_audit│        │ - api_key    │
         │ _events │           │ _log         │        │   _audit_log │
         │ table   │           │              │        └──────────────┘
         │ (source)│           │ (audit trail)│
         └─────────┘           └──────────────┘


```

---

## Event Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEBHOOK INGESTION & PROCESSING                      │
└─────────────────────────────────────────────────────────────────────────────┘

1. WEBHOOK ARRIVAL
   ┌────────────────────────────────────────────────┐
   │  Dialpad Cloud sends POST /webhooks/dialpad    │
   │  Headers:                                      │
   │    - x-dialpad-signature: HMAC-SHA256(secret)  │
   │    - x-dialpad-org-id (optional)               │
   │    - x-app-api-key (optional, for routing)     │
   │  Body: JSON event payload                      │
   └────────────────────┬─────────────────────────┘
                        │
                        ↓
2. WEBHOOK VALIDATION
   ┌────────────────────────────────────────────────┐
   │  webhookController.handleDialpadWebhook()      │
   │  ✓ Verify signature (HMAC-SHA256)              │
   │  ✓ Extract app_id from payload/header          │
   │  ✓ Validate app is active                      │
   │  ✓ Sanitize payload                            │
   └────────────────────┬─────────────────────────┘
                        │
                        ↓
3. IMMUTABLE STORAGE
   ┌────────────────────────────────────────────────┐
   │  INSERT INTO webhook_events (...)              │
   │  - app_id (multi-tenant isolation)             │
   │  - dialpad_event_id (idempotency key)          │
   │  - event_type (call.started, etc.)             │
   │  - payload (full JSONB)                        │
   │  - received_at = now()                         │
   │  - processed_at = NULL (initially)             │
   └────────────────────┬─────────────────────────┘
                        │
                        ↓ (5 seconds later...)
4. EVENT POLLING
   ┌────────────────────────────────────────────────┐
   │  dialpadEventProcessor.poll()                  │
   │  SELECT * FROM webhook_events                  │
   │  WHERE processed_at IS NULL                    │
   │  AND app_id IN (active_apps)                   │
   │  ORDER BY received_at ASC                      │
   │  LIMIT 50                                      │
   │  FOR UPDATE SKIP LOCKED  ← Concurrency safe    │
   └────────────────────┬─────────────────────────┘
                        │
                        ↓
5. HANDLER DISPATCH
   ┌────────────────────────────────────────────────┐
   │  Get handler for event_type from registry:     │
   │  - "call.started" → handleCallStarted          │
   │  - "call.ring" → handleCallRing                │
   │  - "call.ended" → handleCallEnded              │
   │  - "call.recording.completed" → handler        │
   │  - "voicemail.received" → handleVoicemail      │
   └────────────────────┬─────────────────────────┘
                        │
                        ↓
6. DATABASE UPDATE (UPSERT)
   ┌────────────────────────────────────────────────┐
   │  Handler executes UPSERT logic:                │
   │  INSERT INTO calls (app_id, dialpad_call_id)   │
   │  ON CONFLICT (dialpad_call_id)                 │
   │  DO UPDATE SET ...                             │
   │                                                │
   │  OR:                                            │
   │                                                │
   │  INSERT INTO voicemails (...)                  │
   │  ON CONFLICT (...) DO UPDATE SET ...           │
   └────────────────────┬─────────────────────────┘
                        │
                        ├──────────┬──────────────┬──────────────┐
                        │          │              │              │
                        ↓          ↓              ↓              ↓
7. BROADCAST EVENTS
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ broadcastToApp
   │ (all clients)  │ │broadcastToUser
   │ (if mapping)   │ │ Store raw  │ │Mark processed│
   │                │ │ payload    │ │ (audit)      │
   │ WS.send({...}) │ │            │ │              │
   │                │ │ WS.send({..
   │ ↓              │ │ ...})      │ │ UPDATE       │
   │ All connected  │ │            │ │ webhook_     │
   │ clients for    │ │ ↓          │ │ events SET   │
   │ this app       │ │ Specific   │ │ processed_at │
   │ receive event  │ │ user gets  │ │              │
   │                │ │ enriched   │ │ = now()      │
   │                │ │ payload    │ │              │
   │                │ │ with       │ │              │
   │                │ │ target_crm │ │              │
   │                │ │ _user      │ │              │
   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
       (in real-time)


```

---

## WebSocket Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WEBSOCKET CONNECTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. CLIENT INITIATES UPGRADE REQUEST
   ┌────────────────────────────────────────────┐
   │  const ws = new WebSocket(                 │
   │    'ws://localhost:4000/ws',               │
   │    { headers: {                            │
   │        'x-app-api-key': 'app_xxxxx'        │
   │      }}                                    │
   │  );                                        │
   └────────────────────┬───────────────────────┘
                        │ HTTP Upgrade Request
                        │ GET /ws HTTP/1.1
                        │ Upgrade: websocket
                        │ Connection: Upgrade
                        │ Sec-WebSocket-Key: xxx
                        ↓

2. SERVER EXTRACTS API KEY
   ┌────────────────────────────────────────────┐
   │  urlParams.searchParams.get('api_key')     │
   │  OR                                         │
   │  request.headers['x-app-api-key']          │
   └────────────────────┬───────────────────────┘
                        │
                        ↓

3. VALIDATE API KEY
   ┌────────────────────────────────────────────┐
   │  SELECT id, name, is_active                │
   │  FROM apps                                 │
   │  WHERE api_key = $1 LIMIT 1;               │
   │                                            │
   │  If not found or not active:               │
   │    → HTTP 401/403 + socket.destroy()       │
   │                                            │
   │  If valid:                                 │
   │    → Continue with upgrade                 │
   └────────────────────┬───────────────────────┘
                        │
                        ↓

4. COMPLETE UPGRADE
   ┌────────────────────────────────────────────┐
   │  wss.handleUpgrade(request,                │
   │    socket, head, (ws) => {                 │
   │      ws.app_id = app_id;                   │
   │      ws.app_name = app.name;               │
   │      ws.isAlive = true;                    │
   │    });                                     │
   └────────────────────┬───────────────────────┘
                        │
                        ↓

5. ADD TO CONNECTION SET
   ┌────────────────────────────────────────────┐
   │  appConnections.get(app_id).add(ws);       │
   │                                            │
   │  Log: [WS] App connected. Connections: 1   │
   └────────────────────┬───────────────────────┘
                        │
                        ↓

6. READY FOR EVENTS
   ┌────────────────────────────────────────────┐
   │  Client connected and authenticated        │
   │  Waiting for events from event handlers    │
   └────────────────────┬───────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ↓               ↓               ↓
    EVENT            PING/PONG       DISCONNECT
    BROADCAST        (30s
    (from            heartbeat)     ws.on('close')
    handler)           │               │
    │            ws.on('pong'):    Remove from
    │            ws.isAlive=true   appConnections
    │                 │               │
    ↓                 ↓               ↓
ws.send(JSON)    (detection of  appConnections
    │            dead conn)      .get(app_id)
    │                 │          .delete(ws);
    │            ws.terminate()
    │                 │           Log: [WS]
    ↓                 ↓           App disconnected
client                           Remaining: 0
receives                                │
event                                   ↓
    │                                  END
    ↓
client.on('message')
    │
    ↓
Parse JSON
    │
    ↓
Handle event
(call.ring, etc)


```

---

## Data Flow: From Event to Real-Time Broadcast

```
┌────────────────────────────────────────────────────────────────────────────┐
│   FROM DIALPAD WEBHOOK TO REAL-TIME UPDATE IN BASE44 FRONTEND             │
└────────────────────────────────────────────────────────────────────────────┘

DIALPAD SENDS: call.ring webhook
│
├─ event_type: "call.ring"
├─ dialpad_call_id: 123456789
├─ direction: "inbound"
├─ from: "+15551234567"
├─ to: "+15559876543"
├─ user_id: 987654
└─ timestamp: 2026-01-28T10:30:00Z
        │
        ↓
POST /webhooks/dialpad
        │
        ├─ Verify signature
        ├─ Extract app_id from org_id
        ├─ Sanitize payload
        └─ INSERT webhook_events
                │
                ↓ (5s later)
dialpadEventProcessor
        │
        ├─ SELECT from webhook_events WHERE processed_at IS NULL
        ├─ FOR UPDATE SKIP LOCKED
        └─ Dispatch by event_type
                │
                ↓
handleCallRing(payload, app_id)
        │
        ├─ Extract call details
        ├─ Normalize direction
        ├─ Validate status transition
        ├─ UPSERT calls table
        │       │
        │       └─ INSERT INTO calls (
        │           app_id=550e840...,
        │           dialpad_call_id=123456789,
        │           direction='inbound',
        │           from_number='+15551234567',
        │           to_number='+15559876543',
        │           status='ringing',
        │           dialpad_user_id=987654,
        │           raw_payload={...}
        │         )
        │         ON CONFLICT (dialpad_call_id)
        │         DO UPDATE SET status='ringing', ...
        │
        ├─ broadcastToApp(app_id, {
        │   event: 'call.ring',
        │   call_id: 123456789,
        │   direction: 'inbound',
        │   from_number: '+15551234567',
        │   to_number: '+15559876543',
        │   status: 'ringing',
        │   user_id: 987654,
        │   timestamp: '2026-01-28T10:30:00Z'
        │ })
        │       │
        │       ├─ Get appConnections.get(app_id)
        │       │
        │       └─ For each ws in connections:
        │           └─ if (ws.readyState === OPEN):
        │               ws.send(JSON.stringify(event))
        │
        ├─ broadcastToUser(app_id, 987654, {...})
        │       │
        │       ├─ SELECT crm_user_id
        │       │  FROM dialpad_user_mappings
        │       │  WHERE app_id=550e840... AND dialpad_user_id=987654
        │       │
        │       └─ If mapping found:
        │           ├─ Enrich payload with target_crm_user
        │           └─ broadcastToApp(app_id, enriched_event)
        │
        └─ UPDATE webhook_events
            SET processed_at = now()
            WHERE dialpad_event_id = xxx
                │
                ↓
BASE44 FRONTEND receives event
        │
        ├─ ws.addEventListener('message', (event) => {
        │   const msg = JSON.parse(event.data);
        │
        │   if (msg.target_crm_user &&
        │       msg.target_crm_user !== currentUser) {
        │     return; // Not for this user
        │   }
        │
        │   switch(msg.event) {
        │     case 'call.ring':
        │       showIncomingCallAlert(msg);
        │       updateUI();
        │       playRingtone();
        │       break;
        │   }
        │ });
        │
        └─ USER SEES: Incoming call alert with caller info


```

---

## Multi-Tenant Isolation Guarantees

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-TENANT ISOLATION                               │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO: Two apps use the same server
- App A: Base44 (api_key_a)
- App B: CRM X (api_key_b)

LAYER 1: API Authentication
├─ Client A connects: ws://localhost:4000/ws?api_key=app_a
├─ Client B connects: ws://localhost:4000/ws?api_key=app_b
└─ Server validates each key independently
        ↓
LAYER 2: WebSocket Isolation
├─ appConnections = {
│   'app_a_uuid': Set[ws1, ws2, ...],  // App A clients only
│   'app_b_uuid': Set[ws3, ws4, ...]   // App B clients only
│ }
└─ broadcastToApp('app_a_uuid', event)
   → ONLY ws1, ws2, ... receive it
   → ws3, ws4 do NOT receive App A events
        ↓
LAYER 3: Database-Level Isolation
├─ All queries include WHERE app_id = $1
├─ Example:
│  UPDATE calls SET status='ringing'
│  WHERE dialpad_call_id = 123
│  AND app_id = 'app_a_uuid'  ← ENFORCED AT SQL LEVEL
│
├─ Even if Client B somehow guesses App A's call UUID:
│  GET /api/calls/call_uuid
│  → Query includes: AND app_id = 'app_b_uuid'
│  → Call UUID belongs to 'app_a_uuid'
│  → Query returns 0 rows
│  → 404 Not Found
└─ Impossible to leak data across tenants
        ↓
LAYER 4: Service-Level Isolation
├─ userMappingService.getMappingByDialpadId('app_a_uuid', 987654)
│  → Includes: WHERE app_id = $1
├─ voicemailService.getVoicemails('app_a_uuid')
│  → Includes: WHERE app_id = $1
└─ No shared state except database
        ↓
CONCLUSION: Even if attacker compromises one app's API key,
they can ONLY see/modify data for that specific app.
Other apps remain isolated.

```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                               │
└─────────────────────────────────────────────────────────────────────────────┘

LOAD BALANCER (nginx / CloudFlare)
        │
        ├─ Route /webhooks/dialpad       → CTI Node 1/2/3
        ├─ Route /api/calls              → CTI Node 1/2/3
        ├─ Route /ws (upgrade)           → CTI Node 1/2/3 (sticky)
        └─ Route /internal/* (JWT)       → Private network only
                │
        ┌───────┼───────┬───────┐
        ↓       ↓       ↓       ↓
    ┌────────────────┐
    │  CTI Node 1    │
    │ (Port 4000)    │
    │                │
    │ - Express app  │
    │ - WebSocket    │
    │ - Processor    │
    │ - Handlers     │
    └────────────────┘

    ┌────────────────┐
    │  CTI Node 2    │
    │ (Port 4000)    │
    │                │
    │ - Express app  │
    │ - WebSocket    │
    │ - Processor    │
    │ - Handlers     │
    └────────────────┘

    ┌────────────────┐
    │  CTI Node 3    │
    │ (Port 4000)    │
    │                │
    │ - Express app  │
    │ - WebSocket    │
    │ - Processor    │
    │ - Handlers     │
    └────────────────┘
        │
        └─→ PostgreSQL (shared)
                │
        ┌───────┴───────┐
        ↓               ↓
    Primary       Standby (replication)
        │
        ├─ webhook_events (immutable log)
        ├─ calls
        ├─ voicemails
        ├─ dialpad_user_mappings
        ├─ apps
        └─ api_key_audit_log

SCALING NOTES:
- WebSocket connections are per-node (not shared)
  → Consider Redis pub/sub for cross-node broadcasting
- Event processor uses FOR UPDATE SKIP LOCKED
  → Safe to run on multiple nodes
- API calls are stateless
  → Load balance across any node
- User mappings + API keys in shared database
  → Automatic consistency across nodes

```

---

End of Architecture Diagrams
