# Calls API - Quick Reference

## Deployment (2 Steps)

```bash
# 1. Run migration (add indexes)
psql -U your_user -d your_db -f migrations/003_calls_api_indexes.sql

# 2. Restart server
npm restart
```

## API Endpoints

### List Calls

```bash
GET /api/calls
```

**Query Params**: `status`, `direction`, `from`, `to`, `limit`, `offset`

### Get Call by ID

```bash
GET /api/calls/:id
```

### Get Active Calls

```bash
GET /api/calls/active
```

**Query Params**: `direction`, `from`, `to`, `limit`, `offset`

## Authentication

All requests require header:

```
x-app-api-key: your-app-api-key
```

Get your API key from database:

```sql
SELECT api_key FROM apps WHERE is_active = true LIMIT 1;
```

## Testing

```bash
# Get an API key
API_KEY=$(psql -t -c "SELECT api_key FROM apps WHERE is_active = true LIMIT 1;")

# Run test suite
node scripts/testCallsAPI.js $API_KEY

# Manual test
curl -X GET "http://localhost:4000/api/calls" \
  -H "x-app-api-key: $API_KEY"
```

## Response Format

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
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
    "limit": 50,
    "offset": 0,
    "total": 100,
    "has_more": true
  }
}
```

## Common Queries

```bash
# Active calls dashboard
GET /api/calls/active

# Call history (last 50)
GET /api/calls?status=ended&limit=50

# Inbound calls
GET /api/calls?direction=inbound

# Calls from specific number
GET /api/calls?from=+15551234567

# Pagination
GET /api/calls?limit=20&offset=40
```

## Status Codes

- `200` - Success
- `400` - Bad request (invalid params)
- `401` - Unauthorized (missing/invalid API key)
- `403` - Forbidden (inactive app)
- `404` - Not found
- `500` - Server error

## Files Created

1. ✅ `middleware/apiKeyAuth.js` - Authentication
2. ✅ `services/callsService.js` - Query logic
3. ✅ `controllers/callsController.js` - API controller
4. ✅ `routes/calls.js` - Express routes
5. ✅ `migrations/003_calls_api_indexes.sql` - Performance indexes
6. ✅ `scripts/testCallsAPI.js` - Test script
7. ✅ `CALLS_API_DOCUMENTATION.md` - Full docs

## Files Modified

1. ✅ `index.js` - Registered `/api/calls` routes

## Security Features

✓ API key authentication  
✓ Tenant isolation at SQL level  
✓ No raw payloads exposed  
✓ Read-only endpoints  
✓ Input validation  
✓ Inactive apps rejected

## Performance

✓ 6 indexes for common queries  
✓ Partial index for active calls  
✓ Efficient pagination  
✓ Max 100 results per request

## Tenant Isolation

All queries enforce:

```sql
WHERE app_id = $1 AND ...
```

Calls from other apps are never returned, even if someone guesses the UUID.

## Frontend Integration

See `CALLS_API_DOCUMENTATION.md` for:

- TypeScript client example
- Error handling
- Pagination logic
- Filter examples

## Monitoring

```sql
-- Check API usage by app
SELECT a.name, COUNT(c.*) as calls
FROM apps a
LEFT JOIN calls c ON c.app_id = a.id
GROUP BY a.id, a.name;

-- Check index performance
SELECT indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'calls'
ORDER BY idx_scan DESC;
```

## What's NOT Included

- ✗ Write operations (POST/PUT/DELETE)
- ✗ webhook_events exposure
- ✗ Rate limiting (add express-rate-limit if needed)
- ✗ WebSocket support
- ✗ Analytics/aggregations
- ✗ CSV export

## Next Steps

1. Run migration
2. Restart server
3. Test with `testCallsAPI.js`
4. Integrate with Base44 frontend
5. Add rate limiting (optional)
6. Configure CORS for production
