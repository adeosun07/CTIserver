# Calls API Documentation

## Overview

Read-only REST API for fetching call data. Designed for Base44 frontend consumption with multi-tenant security.

## Base URL

```
http://localhost:4000/api/calls
```

## Authentication

All endpoints require API key authentication via header:

```
x-app-api-key: your-app-api-key-here
```

**Security**:

- Tenant isolation enforced at SQL level
- Only calls belonging to the authenticated app are returned
- Inactive apps are rejected with 403 Forbidden

---

## Endpoints

### 1. List Calls

**GET** `/api/calls`

Fetch calls for the authenticated app with optional filters.

#### Query Parameters

| Parameter   | Type    | Required | Description                | Example                      |
| ----------- | ------- | -------- | -------------------------- | ---------------------------- |
| `status`    | string  | No       | Filter by call status      | `active`, `ended`, `ringing` |
| `direction` | string  | No       | Filter by direction        | `inbound`, `outbound`        |
| `from`      | string  | No       | Filter by caller number    | `+15551234567`               |
| `to`        | string  | No       | Filter by callee number    | `+15559876543`               |
| `limit`     | integer | No       | Results per page (max 100) | `50` (default)               |
| `offset`    | integer | No       | Pagination offset          | `0` (default)                |

#### Valid Status Values

- `ringing` - Call is ringing
- `active` - Call in progress
- `ended` - Call completed normally
- `missed` - Call was not answered
- `rejected` - Call was rejected
- `voicemail` - Call went to voicemail

#### Valid Direction Values

- `inbound` - Incoming call
- `outbound` - Outgoing call

#### Example Request

```bash
curl -X GET "http://localhost:4000/api/calls?status=active&limit=10" \
  -H "x-app-api-key: your-api-key"
```

#### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_call_id": 123456789,
      "direction": "inbound",
      "from_number": "+15551234567",
      "to_number": "+15559876543",
      "status": "active",
      "dialpad_user_id": 12345,
      "started_at": "2026-01-27T10:30:00.000Z",
      "ended_at": null,
      "duration_seconds": null,
      "recording_url": null,
      "created_at": "2026-01-27T10:30:00.123Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 42,
    "has_more": true
  }
}
```

---

### 2. Get Call by ID

**GET** `/api/calls/:id`

Fetch a single call by its internal UUID.

#### Path Parameters

| Parameter | Type | Required | Description        |
| --------- | ---- | -------- | ------------------ |
| `id`      | UUID | Yes      | Internal call UUID |

#### Example Request

```bash
curl -X GET "http://localhost:4000/api/calls/550e8400-e29b-41d4-a716-446655440000" \
  -H "x-app-api-key: your-api-key"
```

#### Example Response (Success)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "dialpad_call_id": 123456789,
    "direction": "inbound",
    "from_number": "+15551234567",
    "to_number": "+15559876543",
    "status": "ended",
    "dialpad_user_id": 12345,
    "started_at": "2026-01-27T10:30:00.000Z",
    "ended_at": "2026-01-27T10:35:00.000Z",
    "duration_seconds": 300,
    "recording_url": "https://dialpad.com/recordings/abc123.mp3",
    "created_at": "2026-01-27T10:30:00.123Z"
  }
}
```

#### Example Response (Not Found)

```json
{
  "success": false,
  "error": "Not Found",
  "message": "Call not found"
}
```

---

### 3. Get Active Calls

**GET** `/api/calls/active`

Fetch calls that are currently ringing or in progress. This is a shortcut for filtering by `status IN ('ringing', 'active')`.

#### Query Parameters

| Parameter   | Type    | Required | Description                | Example               |
| ----------- | ------- | -------- | -------------------------- | --------------------- |
| `direction` | string  | No       | Filter by direction        | `inbound`, `outbound` |
| `from`      | string  | No       | Filter by caller number    | `+15551234567`        |
| `to`        | string  | No       | Filter by callee number    | `+15559876543`        |
| `limit`     | integer | No       | Results per page (max 100) | `50` (default)        |
| `offset`    | integer | No       | Pagination offset          | `0` (default)         |

#### Example Request

```bash
curl -X GET "http://localhost:4000/api/calls/active?direction=inbound" \
  -H "x-app-api-key: your-api-key"
```

#### Example Response

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_call_id": 123456789,
      "direction": "inbound",
      "from_number": "+15551234567",
      "to_number": "+15559876543",
      "status": "ringing",
      "dialpad_user_id": 12345,
      "started_at": "2026-01-27T10:30:00.000Z",
      "ended_at": null,
      "duration_seconds": null,
      "recording_url": null,
      "created_at": "2026-01-27T10:30:00.123Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "dialpad_call_id": 987654321,
      "direction": "inbound",
      "from_number": "+15557778888",
      "to_number": "+15559876543",
      "status": "active",
      "dialpad_user_id": 67890,
      "started_at": "2026-01-27T10:28:00.000Z",
      "ended_at": null,
      "duration_seconds": null,
      "recording_url": null,
      "created_at": "2026-01-27T10:28:00.456Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2,
    "has_more": false
  }
}
```

---

## Response Schema

### Call Object

| Field              | Type      | Description                             |
| ------------------ | --------- | --------------------------------------- |
| `id`               | UUID      | Internal call ID                        |
| `dialpad_call_id`  | integer   | Dialpad's call ID                       |
| `direction`        | string    | Call direction: `inbound` \| `outbound` |
| `from_number`      | string    | Caller phone number                     |
| `to_number`        | string    | Callee phone number                     |
| `status`           | string    | Call status (see valid values above)    |
| `dialpad_user_id`  | integer   | Dialpad user ID (nullable)              |
| `started_at`       | timestamp | When call started (nullable)            |
| `ended_at`         | timestamp | When call ended (nullable)              |
| `duration_seconds` | integer   | Call duration in seconds (nullable)     |
| `recording_url`    | string    | URL to call recording (nullable)        |
| `created_at`       | timestamp | When record was created                 |

### Pagination Object

| Field      | Type    | Description                |
| ---------- | ------- | -------------------------- |
| `limit`    | integer | Results per page           |
| `offset`   | integer | Current offset             |
| `total`    | integer | Total matching records     |
| `has_more` | boolean | Whether more results exist |

---

## Error Responses

### 400 Bad Request

Invalid query parameters or request format.

```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Invalid call ID format"
}
```

### 401 Unauthorized

Missing or invalid API key.

```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Missing x-app-api-key header"
}
```

### 403 Forbidden

App is inactive.

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "App is inactive"
}
```

### 404 Not Found

Call doesn't exist or doesn't belong to the authenticated app.

```json
{
  "success": false,
  "error": "Not Found",
  "message": "Call not found"
}
```

### 500 Internal Server Error

Server-side error.

```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Failed to fetch calls"
}
```

---

## Pagination

Use `limit` and `offset` for pagination:

```bash
# Page 1 (results 0-49)
GET /api/calls?limit=50&offset=0

# Page 2 (results 50-99)
GET /api/calls?limit=50&offset=50

# Page 3 (results 100-149)
GET /api/calls?limit=50&offset=100
```

Check `pagination.has_more` to determine if more results exist.

---

## Filtering Examples

### Get all ended calls

```bash
GET /api/calls?status=ended
```

### Get inbound calls only

```bash
GET /api/calls?direction=inbound
```

### Get calls from a specific number

```bash
GET /api/calls?from=+15551234567
```

### Combine filters

```bash
GET /api/calls?status=ended&direction=inbound&limit=20
```

### Get active calls (shortcut)

```bash
GET /api/calls/active
```

---

## Performance Notes

### Indexes

The following indexes are created for optimal query performance:

- `idx_calls_app_started` - Primary listing query
- `idx_calls_app_status_started` - Status filtering
- `idx_calls_app_direction_started` - Direction filtering
- `idx_calls_active` - Active calls (partial index)
- `idx_calls_from_number` - Phone number lookup
- `idx_calls_to_number` - Phone number lookup

### Limits

- Maximum `limit`: 100 results per request
- Default `limit`: 50 results
- Queries sorted by `started_at DESC`

### Tenant Isolation

All queries enforce `app_id` filtering at the SQL level:

```sql
WHERE app_id = $1 AND ...
```

This ensures multi-tenant security even if application logic fails.

---

## Security Best Practices

### 1. API Key Management

- Store API keys securely (environment variables, secrets manager)
- Rotate keys periodically
- Never commit keys to version control

### 2. Rate Limiting (Recommended)

Consider adding rate limiting middleware:

```javascript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});

app.use("/api", limiter);
```

### 3. HTTPS in Production

Always use HTTPS in production to protect API keys in transit.

### 4. CORS Configuration

Configure CORS to allow only trusted frontend origins:

```javascript
app.use(
  cors({
    origin: ["https://base44.example.com"],
    credentials: true,
  }),
);
```

---

## Frontend Integration Example

### JavaScript/TypeScript

```typescript
class CallsAPI {
  private baseURL = "http://localhost:4000/api/calls";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-app-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "API request failed");
    }

    return response.json();
  }

  async listCalls(
    filters: {
      status?: string;
      direction?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );

    return this.request(`?${params}`);
  }

  async getCall(id: string) {
    return this.request(`/${id}`);
  }

  async getActiveCalls(
    filters: {
      direction?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );

    return this.request(`/active?${params}`);
  }
}

// Usage
const api = new CallsAPI("your-api-key");

// Get active calls
const { data: activeCalls } = await api.getActiveCalls();

// Get call history
const { data: calls, pagination } = await api.listCalls({
  status: "ended",
  limit: 20,
});

// Get specific call
const { data: call } = await api.getCall(
  "550e8400-e29b-41d4-a716-446655440000",
);
```

---

## Testing

### 1. Test Authentication

```bash
# Should return 401
curl -X GET "http://localhost:4000/api/calls"

# Should return 200
curl -X GET "http://localhost:4000/api/calls" \
  -H "x-app-api-key: your-api-key"
```

### 2. Test Pagination

```bash
# Get first page
curl -X GET "http://localhost:4000/api/calls?limit=10&offset=0" \
  -H "x-app-api-key: your-api-key"

# Get second page
curl -X GET "http://localhost:4000/api/calls?limit=10&offset=10" \
  -H "x-app-api-key: your-api-key"
```

### 3. Test Filtering

```bash
# Active calls
curl -X GET "http://localhost:4000/api/calls/active" \
  -H "x-app-api-key: your-api-key"

# Ended inbound calls
curl -X GET "http://localhost:4000/api/calls?status=ended&direction=inbound" \
  -H "x-app-api-key: your-api-key"
```

---

## Monitoring

### Log Analysis

```bash
# Check API authentication failures
grep "apiKeyAuth" logs/app.log | grep "Invalid API key"

# Check API usage
grep "CallsController" logs/app.log
```

### Database Queries

```sql
-- Check API key usage
SELECT a.name, COUNT(c.*) as call_count
FROM apps a
LEFT JOIN calls c ON c.app_id = a.id
WHERE a.is_active = true
GROUP BY a.id, a.name;

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE tablename = 'calls'
ORDER BY idx_scan DESC;
```

---

## Future Enhancements

Potential additions (not implemented):

- WebSocket support for real-time call updates
- Call analytics endpoints (stats, aggregations)
- CSV export functionality
- Search by caller name (requires join with dialpad_users)
- Timezone support for timestamps
- Field selection (`?fields=id,status,from_number`)
- Sorting options (`?sort=-started_at`)

---

## Support

For issues or questions:

1. Check this documentation
2. Review error messages and logs
3. Verify API key is valid and app is active
4. Ensure database indexes are created
