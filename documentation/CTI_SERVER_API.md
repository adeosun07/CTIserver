# CTI Server - API Reference

Complete endpoint documentation with request/response examples and effects.

---

## Base URL

```
Development: http://localhost:4000
Production:  https://your-domain.com
```

---

## Authentication Methods

### 1. API Key (Client Apps)

**Header:** `x-app-api-key`  
**Value:** Plain text API key (generated via `/internal/apps`)  
**Used by:** All `/api/calls/*` and `/ws` endpoints

```bash
curl -X GET http://localhost:4000/api/calls/active \
  -H "x-app-api-key: raw_abcdef0123456789..."
```

### 2. Bearer Token (Internal Admin)

**Header:** `Authorization: Bearer <token>`  
**Value:** INTERNAL_API_SECRET from .env  
**Used by:** All `/internal/*` endpoints

```bash
curl -X POST http://localhost:4000/internal/apps \
  -H "Authorization: Bearer f7d3f1e2b8c4a6e9..." \
  -H "Content-Type: application/json"
```

### 3. HMAC Signature (Webhooks - Dialpad Only)

**Header:** `x-dialpad-signature`  
**Value:** HMAC-SHA256(body, DIALPAD_WEBHOOK_SECRET) in Base64  
**Used by:** `/webhooks/dialpad` endpoint  
**Auto-validated:** Server verifies signature matches body

---

## Health & Status Endpoints

### GET /

**Purpose:** Basic health check (no auth needed)

**Request:**

```bash
curl http://localhost:4000/
```

**Response (200):**

```json
{
  "message": "CTI Server is running"
}
```

---

### GET /health

**Purpose:** Detailed health status (used by load balancers)

**Request:**

```bash
curl http://localhost:4000/health
```

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-29T12:00:00.000Z",
  "uptime": 3600,
  "environment": "sandbox",
  "port": 4000
}
```

**Effects:** None (read-only)

---

### GET /metrics

**Purpose:** Server performance metrics

**Request:**

```bash
curl http://localhost:4000/metrics
```

**Response (200):**

```json
{
  "timestamp": "2026-01-29T12:00:00.000Z",
  "memory": {
    "heap_used_mb": 45,
    "heap_total_mb": 128,
    "external_mb": 2
  },
  "uptime_seconds": 3600
}
```

**Effects:** None (read-only)

---

## App Management Endpoints (Internal)

### POST /internal/apps

**Purpose:** Create a new app with auto-generated UUID and API key

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X POST http://localhost:4000/internal/apps \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Mobile App"}'
```

**Request Body:**

```json
{
  "name": "My Mobile App" // Required: 1-255 characters
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "App created successfully. Store the API key securely - it CANNOT be retrieved again.",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My Mobile App",
  "api_key": "raw_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  "created_at": "2026-01-29T12:00:00.000Z",
  "warning": "This is the ONLY time this API key will be displayed. Store it immediately in a secure location.",
  "usage": "Include this app_id for account identification and the api_key in the 'x-app-api-key' header when making API requests"
}
```

**Errors:**

- `400` - Missing or empty name
- `401` - Invalid INTERNAL_API_SECRET
- `500` - Database error

**Effects:**

- ✅ Inserts row into `apps` table
- ✅ Generates random UUID for app_id
- ✅ Creates initial API key (hashed with bcrypt)
- ✅ Logs creation in `api_key_audit_log`

---

## API Key Management Endpoints (Internal)

### POST /internal/apps/:app_id/api-key

**Purpose:** Generate or rotate API key for existing app

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X POST http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**URL Parameters:**

- `app_id` - Valid UUID of app

**Response (200):**

```json
{
  "success": true,
  "message": "API key created successfully. Store this securely - it CANNOT be retrieved again.",
  "api_key": "raw_0987654321fedcba...",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My Mobile App",
  "generated_at": "2026-01-29T12:01:00.000Z",
  "warning": "This is the ONLY time this key will be displayed. Store it immediately in a secure location.",
  "usage": "Include this key in the 'x-app-api-key' header when making API requests"
}
```

**Errors:**

- `400` - Invalid UUID format
- `401` - Invalid INTERNAL_API_SECRET
- `403` - App is inactive
- `404` - App not found
- `500` - Database error

**Effects:**

- ✅ Updates `apps.api_key` with new hashed key
- ✅ Updates `apps.api_key_rotated_at` timestamp
- ✅ Old key becomes immediately invalid
- ✅ Logs rotation in `api_key_audit_log` with hints

---

### GET /internal/apps/:app_id/api-key/status

**Purpose:** Check if app has active API key (without revealing the key)

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X GET http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/status \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**Response (200):**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My Mobile App",
  "has_active_key": true,
  "key_hint": "raw_abcd...6789",
  "last_rotated": "2026-01-29T12:00:00.000Z",
  "action_needed": null
}
```

**Errors:**

- `400` - Invalid UUID format
- `401` - Invalid INTERNAL_API_SECRET
- `404` - App not found

**Effects:** None (read-only)

---

### POST /internal/apps/:app_id/api-key/revoke

**Purpose:** Revoke (disable) current API key - app cannot authenticate until new key generated

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X POST http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/revoke \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**Response (200):**

```json
{
  "success": true,
  "message": "API key revoked. App cannot authenticate until new key is generated.",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My Mobile App",
  "revoked_at": "2026-01-29T12:02:00.000Z"
}
```

**Errors:**

- `400` - Invalid UUID format
- `401` - Invalid INTERNAL_API_SECRET
- `404` - App not found

**Effects:**

- ✅ Sets `apps.api_key` to NULL
- ✅ All API calls immediately return 401
- ✅ Logs revocation in `api_key_audit_log`

---

### GET /internal/apps/:app_id/api-key/audit

**Purpose:** Retrieve audit log of all API key operations for app

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X GET "http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/audit?limit=10&offset=0" \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**Query Parameters:**

- `limit` - Number of records (default: 50, max: 100)
- `offset` - Pagination offset (default: 0)

**Response (200):**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "audit_log": [
    {
      "id": "uuid",
      "action": "rotated",
      "old_key_hint": "raw_aaaa...bbbb",
      "new_key_hint": "raw_cccc...dddd",
      "created_at": "2026-01-29T12:01:00.000Z"
    },
    {
      "id": "uuid",
      "action": "created",
      "old_key_hint": null,
      "new_key_hint": "raw_aaaa...bbbb",
      "created_at": "2026-01-29T12:00:00.000Z"
    }
  ],
  "total": 2,
  "limit": 10,
  "offset": 0
}
```

**Effects:** None (read-only)

---

## User Mapping Endpoints (Internal)

### POST /internal/apps/:app_id/users/map

**Purpose:** Map Dialpad user ID to your CRM user ID (for enriched call data)

**Authentication:** Bearer token (INTERNAL_API_SECRET)

**Request:**

```bash
curl -X POST http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/users/map \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "dialpad_user_id": 12345,
    "crm_user_id": "crm_user_001"
  }'
```

**Request Body:**

```json
{
  "dialpad_user_id": 12345, // Required: Dialpad user numeric ID
  "crm_user_id": "crm_user_001" // Required: Your CRM user identifier
}
```

**Response (200):**

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

**Errors:**

- `400` - Missing or invalid fields
- `401` - Invalid INTERNAL_API_SECRET
- `404` - App not found
- `409` - Mapping already exists (update via HTTP PATCH if supported)

**Effects:**

- ✅ Inserts/updates row in `dialpad_user_mappings` table
- ✅ Future call events with this user will include `user_id` in responses

---

## Calls API Endpoints (Client)

### GET /api/calls/active

**Purpose:** List currently active calls (ringing or in-progress)

**Authentication:** API Key (x-app-api-key header)

**Request:**

```bash
curl -X GET http://localhost:4000/api/calls/active \
  -H "x-app-api-key: raw_abcdef0123456789..."
```

**Query Parameters:** None

**Response (200):**

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
      "user_id": "crm_user_001",
      "user_name": null
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "dialpad_call_id": 888888,
      "direction": "outbound",
      "from_number": "+15550002222",
      "to_number": "+15550003333",
      "status": "active",
      "started_at": "2026-01-29T11:55:00.000Z",
      "user_id": "crm_user_002",
      "user_name": null
    }
  ]
}
```

**Errors:**

- `401` - Missing or invalid API key
- `403` - App inactive

**Effects:** None (read-only query)

---

### GET /api/calls/:id

**Purpose:** Get detailed information about a specific call

**Authentication:** API Key (x-app-api-key header)

**Request:**

```bash
curl -X GET http://localhost:4000/api/calls/550e8400-e29b-41d4-a716-446655440001 \
  -H "x-app-api-key: raw_abcdef0123456789..."
```

**URL Parameters:**

- `id` - Call UUID from previous list call

**Response (200):**

```json
{
  "success": true,
  "call": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "dialpad_call_id": 999999,
    "direction": "inbound",
    "from_number": "+15550001111",
    "to_number": "+15550002222",
    "status": "active",
    "duration_seconds": 120,
    "started_at": "2026-01-29T12:00:00.000Z",
    "ended_at": null,
    "recording_url": "https://...",
    "is_voicemail": false,
    "user_id": "crm_user_001",
    "created_at": "2026-01-29T12:00:00.000Z"
  }
}
```

**Errors:**

- `401` - Missing or invalid API key
- `403` - App inactive
- `404` - Call not found (or belongs to different app)

**Effects:** None (read-only)

---

### GET /api/calls

**Purpose:** List calls with filters and pagination

**Authentication:** API Key (x-app-api-key header)

**Request:**

```bash
curl -X GET "http://localhost:4000/api/calls?status=ended&direction=inbound&limit=20&offset=0" \
  -H "x-app-api-key: raw_abcdef0123456789..."
```

**Query Parameters:**

- `status` - Filter by status: `ringing`, `active`, `ended` (optional)
- `direction` - Filter by direction: `inbound`, `outbound` (optional)
- `from_number` - Filter by caller number (optional)
- `to_number` - Filter by called number (optional)
- `limit` - Number of records (default: 50, max: 500)
- `offset` - Pagination offset (default: 0)

**Response (200):**

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
      "status": "ended",
      "duration_seconds": 300,
      "started_at": "2026-01-28T14:00:00.000Z",
      "ended_at": "2026-01-28T14:05:00.000Z",
      "user_id": "crm_user_001"
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

**Errors:**

- `401` - Missing or invalid API key
- `403` - App inactive

**Effects:** None (read-only)

---

## WebSocket Endpoint (Real-time)

### WS /ws

**Purpose:** Real-time call updates and events

**Authentication:** API Key in handshake message

**Connection:**

```javascript
const ws = new WebSocket("ws://localhost:4000/ws");

ws.onopen = () => {
  // Subscribe to app's call events
  ws.send(
    JSON.stringify({
      type: "subscribe",
      app_id: "550e8400-e29b-41d4-a716-446655440000",
      api_key: "raw_abcdef0123456789...",
    }),
  );
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.event === "call.started") {
    console.log("Incoming call:", data.call_id);
  }
  if (data.event === "call.ended") {
    console.log("Call ended:", data.call_id);
  }
};
```

**Message Types Received:**

**call.started** (incoming or outbound call initiated):

```json
{
  "event": "call.started",
  "call_id": 999999,
  "direction": "inbound",
  "from_number": "+15550001111",
  "to_number": "+15550002222",
  "status": "active",
  "user_id": "crm_user_001",
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

**call.ring** (call is ringing):

```json
{
  "event": "call.ring",
  "call_id": 999999,
  "direction": "inbound",
  "from_number": "+15550001111",
  "to_number": "+15550002222",
  "status": "ringing",
  "user_id": "crm_user_001",
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

**call.ended** (call completed):

```json
{
  "event": "call.ended",
  "call_id": 999999,
  "status": "ended",
  "duration_seconds": 300,
  "timestamp": "2026-01-29T12:05:00.000Z"
}
```

**voicemail.received** (voicemail left):

```json
{
  "event": "voicemail.received",
  "voicemail_id": "uuid",
  "from_number": "+15550001111",
  "to_number": "+15550002222",
  "duration_seconds": 15,
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

**Errors:**

- Connection rejected if API key invalid
- No auth = no messages received

**Effects:** None (read-only subscriptions)

---

## Webhook Endpoint (Dialpad → Server)

### POST /webhooks/dialpad

**Purpose:** Receive call events from Dialpad in real-time

**Authentication:** HMAC-SHA256 signature validation (Dialpad only)

**Headers (from Dialpad):**

```
x-dialpad-signature: <HMAC-SHA256(body, DIALPAD_WEBHOOK_SECRET)>
x-app-api-key: <optional app identification>
```

**Request Body Example (from Dialpad):**

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

**Response (200):**

```json
{
  "received": true
}
```

**Errors:**

- `401` - Invalid signature (HMAC mismatch)
- `401` - Cannot resolve app_id from headers or payload

**Effects:**

- ✅ Validates HMAC signature against DIALPAD_WEBHOOK_SECRET
- ✅ Stores raw event in `webhook_events` table
- ✅ Marks `processed_at = NULL` (unprocessed)
- ✅ Event processor polls every 5 seconds
- ✅ Processor routes to appropriate handler (call.ring → handleCallRing)
- ✅ Handler inserts/updates `calls` table
- ✅ Broadcasts update via WebSocket to connected clients

---

## OAuth Endpoints (Dialpad Integration)

### GET /auth/dialpad/authorize

**Purpose:** Initiate Dialpad OAuth flow (redirect user to Dialpad login)

**Request:**

```bash
# From your frontend:
window.location = 'http://localhost:4000/auth/dialpad/authorize';
```

**Behavior:**

1. Server generates random PKCE state
2. Stores state in session (15-min expiry)
3. Redirects user to Dialpad OAuth URL
4. User logs in to Dialpad
5. Dialpad redirects to callback endpoint

**Effects:**

- ✅ Creates session entry with PKCE state
- ✅ No database changes

---

### GET /auth/dialpad/callback

**Purpose:** Receive authorization code from Dialpad, exchange for access token

**URL:** Redirected to by Dialpad after user auth

**Request:**

```
http://localhost:4000/auth/dialpad/callback?code=authcode&state=random
```

**Response (redirect to frontend):**

```
http://your-frontend.com/callback?status=connected&org_id=12345
```

**Errors:**

- Redirect with `status=failed` if state mismatch, code invalid, or token exchange fails

**Effects:**

- ✅ Exchanges code for access token
- ✅ Inserts/updates row in `dialpad_connections` table
- ✅ Stores access + refresh tokens (encrypted)
- ✅ Stores Dialpad org ID
- ✅ Sets token expiry

---

## Error Responses

All endpoints return error in consistent format:

```json
{
  "error": "Error type or code",
  "message": "Human-readable description"
}
```

### Common Status Codes

| Code | Meaning             | Action                                                  |
| ---- | ------------------- | ------------------------------------------------------- |
| 200  | Success             | Request processed                                       |
| 201  | Created             | Resource created (POST /internal/apps)                  |
| 400  | Bad Request         | Invalid input (missing field, bad format)               |
| 401  | Unauthorized        | Invalid auth (wrong key, missing header, bad signature) |
| 403  | Forbidden           | Auth valid but access denied (app inactive)             |
| 404  | Not Found           | Resource doesn't exist                                  |
| 409  | Conflict            | Duplicate (mapping exists, app already created)         |
| 429  | Too Many Requests   | Rate limited (>300 req/min API, >1000 req/min webhooks) |
| 500  | Server Error        | Database error, unexpected failure                      |
| 503  | Service Unavailable | Database down                                           |

---

## Rate Limiting

| Endpoint            | Limit           | Window                 |
| ------------------- | --------------- | ---------------------- |
| `/api/calls/*`      | 300 req/min     | Per IP address         |
| `/webhooks/dialpad` | 1000 req/min    | Per IP address         |
| `/auth/dialpad/*`   | 10 req / 15 min | Per IP (failures only) |
| `/internal/*`       | 100 req/min     | Per IP address         |

**Response when limited:**

```json
{
  "error": "Too many requests",
  "message": "Please try again later.",
  "retry_after": 60
}
```

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**

- `limit` - Number of records (default: 50)
- `offset` - Number of records to skip (default: 0)

**Response:**

```json
{
  "success": true,
  "items": [...],
  "total": 500,
  "limit": 50,
  "offset": 0
}
```

**Example: Get next 50 records:**

```bash
curl -X GET "http://localhost:4000/api/calls?limit=50&offset=50"
```

---

## Next Steps

- See [CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md) for architecture and workflows
- See [DB_Schema.sql](DB_Schema.sql) for database setup
- See [LOCAL_TESTING_GUIDE.md](LOCAL_TESTING_GUIDE.md) for sandbox testing with Postman
