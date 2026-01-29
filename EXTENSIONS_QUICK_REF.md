# Quick Reference Card - Extensions

## Installation (5 minutes)

```bash
# Step 1: Install dependency
npm install

# Step 2: Apply migration
psql $DATABASE_URL < migrations/004_voicemail_and_user_mappings.sql

# Step 3: Restart server
nodemon index.js

# Expected output:
# Server is running on http://localhost:4000
# WebSocket server available at ws://localhost:4000/ws
```

---

## API Key Management (Sandbox-Safe)

### Generate Key

```bash
curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key
# Returns: {"api_key": "app_xxxxx", ...}
# SAVE THIS IMMEDIATELY - shown only once!
```

### Check Status

```bash
curl http://localhost:4000/internal/apps/$APP_ID/api-key/status
# Returns: has_active_key, key_hint, last_rotated
```

### Rotate Key

```bash
curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key
# Generates new key, invalidates old one
```

### Revoke Key

```bash
curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key/revoke
# Blocks all API access until new key generated
```

### View Audit Log

```bash
curl http://localhost:4000/internal/apps/$APP_ID/api-key/audit
# Shows all rotations/revocations with timestamps
```

---

## WebSocket (Real-Time Events)

### Connect

```javascript
const ws = new WebSocket("ws://localhost:4000/ws?api_key=app_xxxxx");

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.event); // 'call.ring', 'call.started', etc.
});
```

### Events You'll Receive

```javascript
// Incoming call ringing
{
  event: 'call.ring',
  call_id: 123456789,
  from_number: '+1555...',
  to_number: '+1555...',
  status: 'ringing'
}

// Call answered
{
  event: 'call.started',
  call_id: 123456789,
  from_number: '+1555...',
  to_number: '+1555...',
  status: 'active'
}

// Call ended
{
  event: 'call.ended',
  call_id: 123456789,
  duration_seconds: 120,
  status: 'ended'
}

// Voicemail received
{
  event: 'voicemail.received',
  voicemail_id: 'uuid',
  from_number: '+1555...',
  duration_seconds: 45
}
```

---

## Voicemail Management

### List Voicemails

```bash
curl http://localhost:4000/internal/apps/$APP_ID/voicemails?limit=10
```

### Filter by User

```bash
curl "http://localhost:4000/internal/apps/$APP_ID/voicemails?dialpad_user_id=987654"
```

### Get Single Voicemail

```bash
curl http://localhost:4000/internal/apps/$APP_ID/voicemails/$VOICEMAIL_ID
```

### Delete Voicemail

```bash
curl -X DELETE http://localhost:4000/internal/apps/$APP_ID/voicemails/$VOICEMAIL_ID
```

---

## User Mapping (Dialpad ↔ CRM)

### Create Mapping

```bash
curl -X POST http://localhost:4000/internal/apps/$APP_ID/users/map \
  -H "Content-Type: application/json" \
  -d '{"dialpad_user_id": 987654, "crm_user_id": "user_abc"}'
```

### List All Mappings

```bash
curl http://localhost:4000/internal/apps/$APP_ID/users/mappings
```

### Get Mapping by Dialpad ID

```bash
curl http://localhost:4000/internal/apps/$APP_ID/users/mappings/dialpad/987654
```

### Get Mapping by CRM ID

```bash
curl http://localhost:4000/internal/apps/$APP_ID/users/mappings/crm/user_abc
```

### Bulk Sync (from CRM)

```bash
curl -X POST http://localhost:4000/internal/apps/$APP_ID/users/batch-map \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {"dialpad_user_id": 987654, "crm_user_id": "user_abc"},
      {"dialpad_user_id": 987655, "crm_user_id": "user_def"}
    ]
  }'
```

### Delete Mapping

```bash
curl -X DELETE http://localhost:4000/internal/apps/$APP_ID/users/mappings/$MAPPING_ID
```

---

## Common Tasks

### "I lost my API key"

```bash
# Generate a new one (old one becomes invalid)
curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key
```

### "WebSocket won't connect"

```bash
# Check API key status
curl http://localhost:4000/internal/apps/$APP_ID/api-key/status

# Should show: has_active_key: true

# Try connecting again with correct key
wscat -c "ws://localhost:4000/ws?api_key=app_xxxxx"
```

### "Events not broadcasting to user"

```bash
# Check if user mapping exists
curl http://localhost:4000/internal/apps/$APP_ID/users/mappings/dialpad/987654

# If not found, create it
curl -X POST http://localhost:4000/internal/apps/$APP_ID/users/map \
  -d '{"dialpad_user_id": 987654, "crm_user_id": "user_abc"}'
```

### "Need to revoke all access"

```bash
# Revoke API key
curl -X POST http://localhost:4000/internal/apps/$APP_ID/api-key/revoke

# WebSocket connections will drop (no valid key)
# User mappings stay (can regenerate key later)
```

---

## Environment Variables

```env
# Existing (unchanged)
DIALPAD_CLIENT_ID=...
DIALPAD_CLIENT_SECRET=...
DIALPAD_REDIRECT_URI=...
DIALPAD_WEBHOOK_SECRET=...
DATABASE_URL=...
NODE_ENV=production
PORT=443

# New (optional)
# None required - system auto-configures
```

---

## Database Tables (New)

### voicemails

```sql
SELECT * FROM voicemails
WHERE app_id = 'xxx'
ORDER BY created_at DESC;
```

### dialpad_user_mappings

```sql
SELECT * FROM dialpad_user_mappings
WHERE app_id = 'xxx'
ORDER BY created_at DESC;
```

### api_key_audit_log

```sql
SELECT * FROM api_key_audit_log
WHERE app_id = 'xxx'
ORDER BY created_at DESC;
```

---

## Endpoints at a Glance

| Method | Path                                                | Purpose               |
| ------ | --------------------------------------------------- | --------------------- |
| POST   | `/internal/apps/:app_id/api-key`                    | Generate/rotate key   |
| POST   | `/internal/apps/:app_id/api-key/revoke`             | Revoke key            |
| GET    | `/internal/apps/:app_id/api-key/status`             | Check key status      |
| GET    | `/internal/apps/:app_id/api-key/audit`              | View audit log        |
| GET    | `/internal/apps/:app_id/voicemails`                 | List voicemails       |
| GET    | `/internal/apps/:app_id/voicemails/:id`             | Get voicemail         |
| DELETE | `/internal/apps/:app_id/voicemails/:id`             | Delete voicemail      |
| POST   | `/internal/apps/:app_id/users/map`                  | Create/update mapping |
| GET    | `/internal/apps/:app_id/users/mappings`             | List mappings         |
| GET    | `/internal/apps/:app_id/users/mappings/dialpad/:id` | Get by Dialpad ID     |
| GET    | `/internal/apps/:app_id/users/mappings/crm/:id`     | Get by CRM ID         |
| DELETE | `/internal/apps/:app_id/users/mappings/:id`         | Delete mapping        |
| POST   | `/internal/apps/:app_id/users/batch-map`            | Bulk sync mappings    |

---

## WebSocket Events at a Glance

| Event                | When                  | Payload Fields                                                                                       |
| -------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `call.ring`          | Incoming call ringing | event, call_id, direction, from_number, to_number, status, user_id, timestamp                        |
| `call.started`       | Call answered         | event, call_id, direction, from_number, to_number, status, user_id, timestamp                        |
| `call.ended`         | Call completed        | event, call_id, direction, from_number, to_number, status, duration_seconds, user_id, timestamp      |
| `voicemail.received` | Voicemail left        | event, voicemail_id, call_id, from_number, to_number, duration_seconds, [target_crm_user], timestamp |

---

## Response Status Codes

| Code | Meaning                            |
| ---- | ---------------------------------- |
| 200  | OK - Success                       |
| 201  | Created - Resource created         |
| 400  | Bad Request - Invalid input        |
| 401  | Unauthorized - Invalid API key     |
| 403  | Forbidden - API key revoked        |
| 404  | Not Found - Resource doesn't exist |
| 500  | Server Error - Try again later     |

---

## Files to Know

### Documentation

- `EXTENSIONS_QUICK_START.md` - Setup instructions
- `EXTENSIONS_COMPLETE_GUIDE.md` - Detailed features
- `EXTENSIONS_API_REFERENCE.md` - All endpoints
- `EXTENSIONS_ARCHITECTURE_DIAGRAMS.md` - System overview

### Code

- `services/websocketManager.js` - Real-time events
- `services/voicemailService.js` - Voicemail logic
- `services/userMappingService.js` - User mapping logic
- `controllers/apiKeyController.js` - API key endpoints
- `routes/internal.js` - All internal routes

### Database

- `migrations/004_voicemail_and_user_mappings.sql` - Schema

---

## Monitoring

### Check Active Connections

```javascript
// In code:
import { getTotalConnectionCount } from "./services/websocketManager.js";
const count = getTotalConnectionCount();
console.log(`Active WS connections: ${count}`);
```

### View Recent API Key Operations

```bash
curl "http://localhost:4000/internal/apps/$APP_ID/api-key/audit?limit=10"
```

### Monitor Voicemail Volume

```bash
sqlite3 $DATABASE_URL \
  "SELECT DATE(created_at), COUNT(*) FROM voicemails GROUP BY DATE(created_at)"
```

---

## Production Checklist

- [ ] `npm install` completed
- [ ] Migration applied
- [ ] Server restarted
- [ ] API key generated
- [ ] WebSocket tested
- [ ] User mappings created
- [ ] `/internal` routes protected by JWT
- [ ] Rate limiting configured
- [ ] Monitoring enabled
- [ ] Backups configured
- [ ] WSS (secure WebSocket) enabled

---

**Ready to deploy! 🚀**

For detailed info, see:

- Installation → EXTENSIONS_QUICK_START.md
- Features → EXTENSIONS_COMPLETE_GUIDE.md
- API → EXTENSIONS_API_REFERENCE.md
- Architecture → EXTENSIONS_ARCHITECTURE_DIAGRAMS.md
