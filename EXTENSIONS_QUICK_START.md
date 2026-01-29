# Implementation & Deployment Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This adds `ws` (WebSocket library) to your project.

### 2. Apply Database Migration

Run the migration to create the new tables:

```bash
psql $DATABASE_URL < migrations/004_voicemail_and_user_mappings.sql
```

**Tables created:**

- `voicemails` - Voicemail records
- `dialpad_user_mappings` - Dialpad ↔ CRM user mappings
- `api_key_audit_log` - API key operation audit trail

**Columns added:**

- `apps.api_key_rotated_at` - Last rotation timestamp

### 3. Restart Server

```bash
npm start
# or with nodemon
nodemon index.js
```

**Output should show:**

```
Server is running on http://localhost:4000
WebSocket server available at ws://localhost:4000/ws
Webhook event processor started (polling every 5s)
```

---

## Verify Installation

### Test 1: Health Check

```bash
curl http://localhost:4000/
```

Expected: `{ "message": "CTI Server is running" }`

### Test 2: Generate API Key

Replace `APP_ID` with a real UUID from your `apps` table:

```bash
APP_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key
```

Expected: Returns `api_key` that you can use for API calls

**Store this key immediately** - it's shown only once!

### Test 3: Use API Key

```bash
API_KEY="app_abc123..."

curl -X GET http://localhost:4000/api/calls \
  -H "x-app-api-key: $API_KEY"
```

Expected: Returns list of calls for the app

### Test 4: Connect WebSocket

```bash
wscat -c "ws://localhost:4000/ws?api_key=$API_KEY"
```

Expected: Connection established, ready for events

---

## Architecture Summary

### New Files Created

```
services/
  ├── websocketManager.js          # WebSocket server (165 lines)
  ├── voicemailService.js          # Voicemail logic (250 lines)
  └── userMappingService.js        # User mapping logic (270 lines)

controllers/
  ├── apiKeyController.js          # API key endpoints (195 lines)
  ├── voicemailController.js       # Voicemail endpoints (85 lines)
  └── userMappingController.js     # User mapping endpoints (180 lines)

routes/
  └── internal.js                  # All internal endpoints (175 lines)

migrations/
  └── 004_voicemail_and_user_mappings.sql
```

### Modified Files

```
services/callEventHandlers.js       # +WebSocket broadcast, +voicemail handler
index.js                            # +WebSocket init, +internal routes
package.json                        # +ws dependency
```

### Total New Code

- **Services:** ~685 lines
- **Controllers:** ~460 lines
- **Routes:** ~175 lines
- **Migrations:** ~55 lines
- **Total:** ~1,375 lines of new production code

---

## Feature Walkthrough

### Feature 1: API Key Management

**What it does:**

- Generate secure API keys for apps
- Rotate existing keys
- Revoke access
- Audit trail of all operations

**Endpoints:**

- `POST /internal/apps/:app_id/api-key` - Create/rotate
- `POST /internal/apps/:app_id/api-key/revoke` - Revoke
- `GET /internal/apps/:app_id/api-key/status` - Check status
- `GET /internal/apps/:app_id/api-key/audit` - View history

**Usage:**

```bash
# Generate key
curl -X POST http://localhost:4000/internal/apps/550e8400.../api-key

# Check status (no key revealed)
curl http://localhost:4000/internal/apps/550e8400.../api-key/status

# Rotate (generates new key, invalidates old)
curl -X POST http://localhost:4000/internal/apps/550e8400.../api-key

# View audit log
curl http://localhost:4000/internal/apps/550e8400.../api-key/audit
```

---

### Feature 2: WebSocket Server

**What it does:**

- Real-time call and voicemail events
- Per-app isolated connections
- Automatic dead connection cleanup
- Two-tier broadcasting (app-level + user-level)

**How to connect:**

```javascript
// Method 1: Query parameter
const ws = new WebSocket("ws://localhost:4000/ws?api_key=app_xxxxx");

// Method 2: Header (if using compatible client)
const ws = new WebSocket("ws://localhost:4000/ws", {
  headers: { "x-app-api-key": "app_xxxxx" },
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  console.log("Event received:", message.event);
});
```

**Events you'll receive:**

- `call.ring` - Incoming call ringing
- `call.started` - Call answered and active
- `call.ended` - Call completed
- `voicemail.received` - Voicemail left

---

### Feature 3: Voicemail System

**What it does:**

- Store voicemails as independent entities
- Link to calls if applicable
- Support transcripts (AI-generated)
- Query by user, date, or status

**Endpoints:**

- `GET /internal/apps/:app_id/voicemails` - List all
- `GET /internal/apps/:app_id/voicemails/:id` - Get one
- `DELETE /internal/apps/:app_id/voicemails/:id` - Delete

**Events from Dialpad:**
When Dialpad sends `voicemail.received` webhook, the system:

1. Creates/updates voicemail record
2. Broadcasts to assigned user via WebSocket
3. Links to call if applicable

**Usage:**

```bash
# List voicemails
curl http://localhost:4000/internal/apps/550e8400.../voicemails?limit=10

# Filter by user
curl "http://localhost:4000/internal/apps/550e8400.../voicemails?dialpad_user_id=987654"

# Get specific voicemail
curl http://localhost:4000/internal/apps/550e8400.../voicemails/uuid
```

---

### Feature 4: User Mapping

**What it does:**

- Map Dialpad user IDs (integers) to CRM user IDs (strings)
- Enable call attribution and user-targeted notifications
- Support bulk sync from CRM

**Endpoints:**

- `POST /internal/apps/:app_id/users/map` - Create/update
- `GET /internal/apps/:app_id/users/mappings` - List all
- `GET /internal/apps/:app_id/users/mappings/dialpad/:id` - Get by Dialpad ID
- `GET /internal/apps/:app_id/users/mappings/crm/:id` - Get by CRM ID
- `DELETE /internal/apps/:app_id/users/mappings/:id` - Delete
- `POST /internal/apps/:app_id/users/batch-map` - Bulk sync

**Usage:**

```bash
# Create mapping
curl -X POST http://localhost:4000/internal/apps/550e8400.../users/map \
  -H "Content-Type: application/json" \
  -d '{"dialpad_user_id": 987654, "crm_user_id": "user_abc"}'

# List all mappings
curl http://localhost:4000/internal/apps/550e8400.../users/mappings

# Bulk sync from CRM
curl -X POST http://localhost:4000/internal/apps/550e8400.../users/batch-map \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {"dialpad_user_id": 987654, "crm_user_id": "user_abc"},
      {"dialpad_user_id": 987655, "crm_user_id": "user_def"},
      {"dialpad_user_id": 987656, "crm_user_id": "user_ghi"}
    ]
  }'
```

---

## Integration with Existing System

### Event Handler Chain

1. **Webhook arrives** → POST /webhooks/dialpad
2. **Stored** → webhook_events table
3. **Processed** → dialpadEventProcessor polls every 5s
4. **Handler dispatched** → Registered handler for event_type
5. **Database updated** → calls or voicemails table
6. **WebSocket broadcast** → Connected clients notified
7. **Marked processed** → webhook_events.processed_at set

### Example: Call.ring Event

```
Dialpad Cloud
    ↓ (webhook with call.ring)
POST /webhooks/dialpad
    ↓
webhook_events table (stored)
    ↓ (5s later)
dialpadEventProcessor picks it up
    ↓
handleCallRing() handler executes
    ↓
calls table updated (status='ringing')
    ↓
broadcastToApp(app_id, {event: 'call.ring', ...})
broadcastToUser(app_id, dialpad_user_id, {...})
    ↓
Connected WebSocket clients receive message in real-time
```

---

## Configuration

### Default Settings

**WebSocket Heartbeat:**

- Check every 30 seconds
- Terminates unresponsive connections
- Sends PING, expects PONG

**Event Processing:**

- Poll interval: 5 seconds
- Batch size: 50 events per poll
- Uses `FOR UPDATE SKIP LOCKED` for concurrency safety

**Voicemail:**

- Stores full transcript (if provided)
- Links to call when dialpad_call_id present
- Broadcasts to user via mapping

**User Mapping:**

- No auto-mapping during OAuth
- Manual creation via `/internal/users/map`
- Supports bulk sync

### Custom Configuration (Optional)

If you need different settings, modify `index.js`:

```javascript
// Change polling interval
const stopProcessor = startEventProcessor({
  intervalMs: 10000, // Poll every 10 seconds instead of 5
  batchSize: 100, // Process up to 100 events instead of 50
});
```

---

## Monitoring & Troubleshooting

### Check WebSocket Connections

```sql
-- No SQL query (in-memory per server)
-- Use monitoring endpoint (add to routes):
GET /internal/monitoring/websocket/stats
```

### Check API Key Audit Log

```bash
curl "http://localhost:4000/internal/apps/$APP_ID/api-key/audit?limit=20"
```

### Monitor Voicemail Volume

```sql
SELECT DATE(created_at), COUNT(*)
FROM voicemails
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

### Check User Mappings

```bash
curl "http://localhost:4000/internal/apps/$APP_ID/users/mappings?limit=100"
```

### View Server Logs

```bash
# If running with nodemon
nodemon --inspect index.js

# Check console output for:
# [WebSocket] Connection/disconnect events
# [APIKey] Rotation/revocation events
# [Voicemail] Creation/update events
# [UserMapping] Mapping changes
```

---

## Security Checklist

- [ ] API keys stored securely (`.env` or secrets manager)
- [ ] Internal routes protected by additional auth (JWT, mTLS, etc.)
- [ ] WebSocket uses WSS (wss://) in production
- [ ] CORS configured correctly for your domain
- [ ] Database backups include new tables (voicemails, mappings, audit log)
- [ ] Rate limiting on internal endpoints to prevent abuse
- [ ] Monitor for unauthorized API key generation attempts
- [ ] Set up alerts for API key rotations
- [ ] Audit user mapping changes regularly

---

## Common Issues & Solutions

### Issue: WebSocket connection rejected with "401 Unauthorized"

**Cause:** Invalid or missing API key

**Solution:**

1. Verify API key exists: `GET /internal/apps/:app_id/api-key/status`
2. Generate new key if revoked: `POST /internal/apps/:app_id/api-key`
3. Ensure header format: `x-app-api-key: app_xxxxx` (no quotes)

### Issue: Voicemails not being created

**Cause:** Webhook from Dialpad not reaching server or not being processed

**Solution:**

1. Check webhook registration in Dialpad admin console
2. Verify `DIALPAD_WEBHOOK_SECRET` in `.env` matches Dialpad
3. Check webhook_events table: `SELECT * FROM webhook_events WHERE event_type LIKE '%voicemail%'`
4. Check logs for handler errors

### Issue: User mappings exist but WebSocket events not targeted

**Cause:** Mapping not created or broadcastToUser not finding mapping

**Solution:**

1. Verify mapping exists: `GET /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id`
2. Check voicemail has correct dialpad_user_id
3. Events still broadcast to app (fallback), just not user-targeted

### Issue: WebSocket connection drops frequently

**Cause:** Network issues or heartbeat timeout

**Solution:**

1. Ensure client responds to PING with PONG
2. Check network stability
3. Increase heartbeat timeout (edit websocketManager.js line 80)
4. Check server resources (CPU, memory)

---

## Next Steps

1. **Run installation** → `npm install && psql $DATABASE_URL < migrations/004_voicemail_and_user_mappings.sql`
2. **Start server** → `nodemon index.js`
3. **Generate API key** → `POST /internal/apps/:app_id/api-key`
4. **Test WebSocket** → Connect to `ws://localhost:4000/ws?api_key=...`
5. **Create user mapping** → `POST /internal/apps/:app_id/users/map`
6. **Trigger test event** → Send test webhook via Dialpad or manually insert
7. **Verify broadcast** → Should receive WebSocket message

---

## Reference

For detailed documentation, see:

- `EXTENSIONS_COMPLETE_GUIDE.md` - Full API reference and architecture
- `API_KEY_FLOW_GUIDE.md` - Authentication flows (unchanged)
- `CALLS_API_DOCUMENTATION.md` - Calls API endpoints (unchanged)
- `SYSTEM_ARCHITECTURE_FLOW.md` - Overall system architecture
