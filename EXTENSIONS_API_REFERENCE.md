# Complete API Reference - Extensions

Quick reference for all new and modified endpoints.

---

## API Key Management Endpoints

### Generate or Rotate API Key

```
POST /internal/apps/:app_id/api-key
```

**Response (201 Created):**

```json
{
  "success": true,
  "message": "API key created successfully. Store this securely - it cannot be retrieved again.",
  "api_key": "app_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "Base44 CRM",
  "rotated_at": "2026-01-28T10:30:00.000Z",
  "note": "Store this key in your .env file. It will never be shown again."
}
```

### Revoke API Key

```
POST /internal/apps/:app_id/api-key/revoke
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "API key revoked. App cannot authenticate until new key is generated.",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "Base44 CRM",
  "revoked_at": "2026-01-28T10:45:00.000Z"
}
```

### Check API Key Status

```
GET /internal/apps/:app_id/api-key/status
```

**Response (200 OK):**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "Base44 CRM",
  "has_active_key": true,
  "key_hint": "app_a1b2...f2",
  "last_rotated": "2026-01-28T10:30:00.000Z",
  "action_needed": null
}
```

### View API Key Audit Log

```
GET /internal/apps/:app_id/api-key/audit[?limit=50&offset=0]
```

**Response (200 OK):**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "audit_log": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "app_id": "550e8400-e29b-41d4-a716-446655440000",
      "action": "rotated",
      "old_key_hint": "app_xyz1...def2",
      "new_key_hint": "app_a1b2...f2",
      "performed_at": "2026-01-28T10:30:00.000Z",
      "created_at": "2026-01-28T10:30:00.000Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

## Voicemail Endpoints

### List Voicemails

```
GET /internal/apps/:app_id/voicemails[?limit=50&offset=0&dialpad_user_id=987654]
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "app_id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_call_id": 123456789,
      "dialpad_user_id": 987654,
      "from_number": "+15551234567",
      "to_number": "+15559876543",
      "recording_url": "https://dialpad.com/voicemail/abc123.mp3",
      "transcript": "Hi John, this is Mary calling about the meeting tomorrow...",
      "duration_seconds": 45,
      "created_at": "2026-01-28T10:30:00.000Z",
      "updated_at": "2026-01-28T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 15,
    "has_more": false
  }
}
```

### Get Single Voicemail

```
GET /internal/apps/:app_id/voicemails/:voicemail_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440002",
    "app_id": "550e8400-e29b-41d4-a716-446655440000",
    "dialpad_call_id": 123456789,
    "dialpad_user_id": 987654,
    "from_number": "+15551234567",
    "to_number": "+15559876543",
    "recording_url": "https://dialpad.com/voicemail/abc123.mp3",
    "transcript": "Hi John...",
    "duration_seconds": 45,
    "created_at": "2026-01-28T10:30:00.000Z",
    "updated_at": "2026-01-28T10:30:00.000Z"
  }
}
```

### Delete Voicemail

```
DELETE /internal/apps/:app_id/voicemails/:voicemail_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Voicemail deleted"
}
```

**Response (404 Not Found):**

```json
{
  "error": "Voicemail not found"
}
```

---

## User Mapping Endpoints

### Create or Update User Mapping

```
POST /internal/apps/:app_id/users/map
```

**Request Body:**

```json
{
  "dialpad_user_id": 987654,
  "crm_user_id": "user_abc123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440003",
    "app_id": "550e8400-e29b-41d4-a716-446655440000",
    "dialpad_user_id": 987654,
    "crm_user_id": "user_abc123",
    "created_at": "2026-01-28T10:30:00.000Z",
    "updated_at": "2026-01-28T10:30:00.000Z"
  },
  "message": "User mapping created/updated"
}
```

### List All User Mappings

```
GET /internal/apps/:app_id/users/mappings[?limit=100&offset=0]
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440003",
      "app_id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_user_id": 987654,
      "crm_user_id": "user_abc123",
      "created_at": "2026-01-28T10:30:00.000Z",
      "updated_at": "2026-01-28T10:30:00.000Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440004",
      "app_id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_user_id": 987655,
      "crm_user_id": "user_def456",
      "created_at": "2026-01-28T10:31:00.000Z",
      "updated_at": "2026-01-28T10:31:00.000Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 42,
    "has_more": false
  }
}
```

### Get Mapping by Dialpad User ID

```
GET /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440003",
    "app_id": "550e8400-e29b-41d4-a716-446655440000",
    "dialpad_user_id": 987654,
    "crm_user_id": "user_abc123",
    "created_at": "2026-01-28T10:30:00.000Z",
    "updated_at": "2026-01-28T10:30:00.000Z"
  }
}
```

### Get Mapping by CRM User ID

```
GET /internal/apps/:app_id/users/mappings/crm/:crm_user_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440003",
    "app_id": "550e8400-e29b-41d4-a716-446655440000",
    "dialpad_user_id": 987654,
    "crm_user_id": "user_abc123",
    "created_at": "2026-01-28T10:30:00.000Z",
    "updated_at": "2026-01-28T10:30:00.000Z"
  }
}
```

### Delete Mapping by ID

```
DELETE /internal/apps/:app_id/users/mappings/:mapping_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Mapping deleted"
}
```

### Delete Mapping by Dialpad User ID

```
DELETE /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Mapping deleted"
}
```

### Batch Create/Update User Mappings

```
POST /internal/apps/:app_id/users/batch-map
```

**Request Body:**

```json
{
  "mappings": [
    {
      "dialpad_user_id": 987654,
      "crm_user_id": "user_abc123"
    },
    {
      "dialpad_user_id": 987655,
      "crm_user_id": "user_def456"
    },
    {
      "dialpad_user_id": 987656,
      "crm_user_id": "user_ghi789"
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Batch mapped 3 users",
  "count": 3
}
```

---

## WebSocket Events

### Connection

```
ws://localhost:4000/ws?api_key=app_xxxxx
```

or with header:

```javascript
new WebSocket("ws://localhost:4000/ws", {
  headers: { "x-app-api-key": "app_xxxxx" },
});
```

### Call Ring Event

```json
{
  "event": "call.ring",
  "call_id": 123456789,
  "direction": "inbound",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "status": "ringing",
  "user_id": 987654,
  "timestamp": "2026-01-28T10:30:00.000Z"
}
```

### Call Started Event

```json
{
  "event": "call.started",
  "call_id": 123456789,
  "direction": "inbound",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "status": "active",
  "user_id": 987654,
  "timestamp": "2026-01-28T10:31:00.000Z"
}
```

### Call Ended Event

```json
{
  "event": "call.ended",
  "call_id": 123456789,
  "direction": "inbound",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "status": "ended",
  "duration_seconds": 120,
  "user_id": 987654,
  "timestamp": "2026-01-28T10:33:00.000Z"
}
```

### Voicemail Received Event

```json
{
  "event": "voicemail.received",
  "voicemail_id": "660e8400-e29b-41d4-a716-446655440002",
  "call_id": 123456789,
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "duration_seconds": 45,
  "timestamp": "2026-01-28T10:33:30.000Z"
}
```

### Voicemail Received Event (With User Targeting)

```json
{
  "event": "voicemail.received",
  "voicemail_id": "660e8400-e29b-41d4-a716-446655440002",
  "call_id": 123456789,
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "duration_seconds": 45,
  "target_crm_user": "user_abc123",
  "timestamp": "2026-01-28T10:33:30.000Z"
}
```

---

## Example Requests

### cURL Examples

#### Generate API Key

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key \
  -H 'Content-Type: application/json'
```

#### Create User Mapping

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/users/map \
  -H 'Content-Type: application/json' \
  -d '{
    "dialpad_user_id": 987654,
    "crm_user_id": "user_abc123"
  }'
```

#### Batch Map Users

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/users/batch-map \
  -H 'Content-Type: application/json' \
  -d '{
    "mappings": [
      {"dialpad_user_id": 987654, "crm_user_id": "user_abc"},
      {"dialpad_user_id": 987655, "crm_user_id": "user_def"},
      {"dialpad_user_id": 987656, "crm_user_id": "user_ghi"}
    ]
  }'
```

#### List Voicemails

```bash
curl -X GET \
  'http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/voicemails?limit=10'
```

#### Check API Key Status

```bash
curl -X GET \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/status
```

### JavaScript Examples

#### Create User Mapping

```javascript
async function createMapping(appId, dialpadUserId, crmUserId) {
  const response = await fetch(`/internal/apps/${appId}/users/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dialpad_user_id: dialpadUserId,
      crm_user_id: crmUserId,
    }),
  });
  return response.json();
}

// Usage
await createMapping(
  "550e8400-e29b-41d4-a716-446655440000",
  987654,
  "user_abc123",
);
```

#### Connect to WebSocket

```javascript
const apiKey = "app_xxxxx"; // Generated via API

const ws = new WebSocket(`ws://localhost:4000/ws?api_key=${apiKey}`);

ws.addEventListener("open", () => {
  console.log("Connected to WebSocket");
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  console.log("Event:", message.event);
  console.log("Call/Voicemail ID:", message.call_id || message.voicemail_id);
  console.log("From:", message.from_number);
  console.log("To:", message.to_number);

  // Handle different event types
  switch (message.event) {
    case "call.ring":
      showIncomingCallAlert(message);
      break;
    case "call.started":
      updateCallStatus(message, "active");
      break;
    case "call.ended":
      updateCallStatus(message, "ended");
      break;
    case "voicemail.received":
      showVoicemailNotification(message);
      break;
  }
});

ws.addEventListener("error", (error) => {
  console.error("WebSocket error:", error);
});

ws.addEventListener("close", () => {
  console.log("WebSocket disconnected");
  // Attempt reconnection
  setTimeout(() => location.reload(), 3000);
});
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "Missing required fields",
  "required": ["dialpad_user_id", "crm_user_id"]
}
```

### 401 Unauthorized (WebSocket)

```
HTTP/1.1 401 Unauthorized
```

### 403 Forbidden

```
HTTP/1.1 403 Forbidden
```

### 404 Not Found

```json
{
  "error": "Voicemail not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to create voicemail"
}
```

---

## Status Codes

| Code | Meaning      | Example                |
| ---- | ------------ | ---------------------- |
| 200  | OK           | GET succeeded          |
| 201  | Created      | POST succeeded         |
| 400  | Bad Request  | Missing fields         |
| 401  | Unauthorized | Invalid API key        |
| 403  | Forbidden    | API key revoked        |
| 404  | Not Found    | Resource doesn't exist |
| 500  | Server Error | Database failure       |

---

## Pagination

All list endpoints support pagination:

```
GET /internal/apps/:app_id/voicemails?limit=50&offset=0
```

**Query Parameters:**

- `limit` - Number of results (default varies by endpoint)
- `offset` - Number of results to skip (default 0)

**Response includes:**

```json
{
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123,
    "has_more": true
  }
}
```

---

## Rate Limiting

Recommended (not yet implemented):

- API key endpoints: 10 requests/minute
- User mapping endpoints: 100 requests/minute
- Voicemail endpoints: 200 requests/minute

Add to `routes/internal.js` or middleware as needed.
