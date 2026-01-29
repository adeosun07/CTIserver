# Webhook Event Processing System

Complete implementation of webhook event processing for Dialpad integration.

## 📁 Files Created

### 1. Database Migration

- **`migrations/001_webhook_processing.sql`**
  - Adds `processed_at` column to `webhook_events` table
  - Creates indexes for efficient querying
  - Adds unique constraint on `dialpad_event_id`

### 2. Core Services

- **`services/dialpadEventProcessor.js`**
  - Main event processing engine
  - Polls for unprocessed events
  - Routes events to handlers by type
  - Marks events as processed

- **`services/callEventHandlers.js`**
  - Handlers for call lifecycle events:
    - `call.started` → Creates/updates call with status='active'
    - `call.ring` → Creates/updates call with status='ringing'
    - `call.ended` → Updates call with status='ended'
    - `call.recording.completed` → Attaches recording URL

### 3. Utility Scripts

- **`scripts/processEvents.js`**
  - Manual event processing
  - View processing statistics

- **`scripts/generateTestEvents.js`**
  - Generate test webhook events
  - Useful for testing without real Dialpad webhooks

### 4. Documentation

- **`WEBHOOK_PROCESSING_GUIDE.md`**
  - Complete integration guide
  - Architecture decisions
  - Monitoring and troubleshooting

### 5. Updated Files

- **`index.js`**
  - Initialized event processor on startup
  - Registered call event handlers
  - Added graceful shutdown

## 🚀 Quick Start

### Step 1: Run the Migration

```bash
# Connect to PostgreSQL and run migration
psql -U your_user -d your_database -f migrations/001_webhook_processing.sql
```

### Step 2: Start the Server

The event processor starts automatically when you run the server:

```bash
npm start
```

You should see:

```
Server is running on http://localhost:4000
Webhook event processor started (polling every 5s)
[CallHandlers] Registered call event handlers
```

### Step 3: Test with Sample Data (Optional)

```bash
# Generate test events
node scripts/generateTestEvents.js

# Check statistics
node scripts/processEvents.js stats

# Manually process events (if processor not running)
node scripts/processEvents.js process
```

## 🏗️ Architecture

```
Webhook Ingestion (existing)
         ↓
  webhook_events table
         ↓
Event Processor (polls every 5s)
         ↓
   Event Router
         ↓
    ┌────┴────┬─────────┬──────────┐
    ↓         ↓         ↓          ↓
call.ring  call.started  call.ended  recording.completed
    ↓         ↓         ↓          ↓
         calls table
         ↓
   marked as processed
```

### Key Design Decisions

1. **Separation of Concerns**
   - Webhook controller: Ingestion only (fast response)
   - Processor service: Business logic (can be slow)

2. **Polling vs Queue**
   - Simple polling for < 1000 events/minute
   - No additional infrastructure needed
   - Easy to monitor and debug

3. **Idempotency**
   - `dialpad_call_id` UNIQUE prevents duplicate calls
   - `dialpad_event_id` UNIQUE prevents duplicate webhooks
   - UPSERT operations safe to retry

4. **Error Handling**
   - Failed events remain unprocessed
   - Automatic retry on next poll
   - Unknown event types logged and marked processed

## 📊 Monitoring

### Check Processing Stats

```bash
node scripts/processEvents.js stats
```

Output:

```
Processing Statistics:
──────────────────────────────────────────────────
Unprocessed events:  15
Processed events:    1234
Event types:         4
Oldest unprocessed:  2026-01-27T10:30:00Z
──────────────────────────────────────────────────
```

### Database Queries

```sql
-- Unprocessed events by type
SELECT event_type, COUNT(*)
FROM webhook_events
WHERE processed_at IS NULL
GROUP BY event_type;

-- Recent processing activity
SELECT
  event_type,
  COUNT(*) as count,
  MAX(processed_at) as last_processed
FROM webhook_events
WHERE processed_at > now() - interval '1 hour'
GROUP BY event_type;
```

## 🔧 Configuration

### Polling Interval

Adjust in `index.js`:

```javascript
const stopProcessor = startEventProcessor({
  intervalMs: 5000, // Default: 5 seconds
  batchSize: 50, // Default: 50 events per batch
});
```

**Recommendations:**

- Low volume (< 100/hour): 10-30 seconds
- Medium volume (< 1000/hour): 5 seconds
- High volume (> 5000/minute): Consider message queue

## 📝 Adding New Event Types

Example: Add SMS event handler

1. Create handler file `services/smsEventHandlers.js`:

```javascript
import pool from "../db.js";
import { registerEventHandler } from "./dialpadEventProcessor.js";

async function handleSmsReceived(payload, app_id) {
  const { id, from, to, text, sent_at } = payload;

  await pool.query(
    `INSERT INTO messages (
       app_id, dialpad_message_id, direction, 
       from_number, to_number, text, sent_at
     )
     VALUES ($1, $2, 'inbound', $4, $5, $6, $7)
     ON CONFLICT (dialpad_message_id) DO NOTHING`,
    [app_id, id, from, to, text, sent_at],
  );
}

export function registerSmsHandlers() {
  registerEventHandler("sms.received", handleSmsReceived);
}
```

2. Register in `index.js`:

```javascript
import { registerSmsHandlers } from "./services/smsEventHandlers.js";

registerCallHandlers();
registerSmsHandlers(); // Add this
```

## 🧪 Testing

### 1. Generate Test Data

```bash
node scripts/generateTestEvents.js
```

### 2. Verify Events Created

```sql
SELECT id, event_type, processed_at
FROM webhook_events
WHERE dialpad_event_id LIKE 'test_%';
```

### 3. Process Events

Either wait for automatic processing (5s) or run manually:

```bash
node scripts/processEvents.js process
```

### 4. Check Results

```sql
SELECT dialpad_call_id, status, recording_url
FROM calls
WHERE dialpad_call_id = 999888777;
```

## 🐛 Troubleshooting

### Events Not Processing

1. Check processor is running: Look for startup message in logs
2. Check for errors: `node scripts/processEvents.js process`
3. Check database connection: Verify `db.js` configuration

### Processing Lag

```bash
# Check stats
node scripts/processEvents.js stats

# If many unprocessed, manually process:
node scripts/processEvents.js process
```

### Failed Events

Events that fail remain unprocessed. Check logs for errors, fix the issue, and events will auto-retry.

To skip permanently failed events:

```sql
UPDATE webhook_events
SET processed_at = now()
WHERE id = 'problem-event-id';
```

## 📚 Event Payload Examples

### call.started

```json
{
  "call": {
    "id": 123456789,
    "direction": "inbound",
    "from": "+15551234567",
    "to": "+15559876543",
    "user_id": 12345,
    "started_at": "2026-01-27T10:00:00Z"
  }
}
```

### call.ended

```json
{
  "call": {
    "id": 123456789,
    "ended_at": "2026-01-27T10:05:00Z",
    "duration": 300
  }
}
```

### call.recording.completed

```json
{
  "recording": {
    "call_id": 123456789,
    "url": "https://dialpad.com/recordings/abc123.mp3"
  }
}
```

## 🔒 Security Notes

- Webhook signatures verified in `webhookController.js` (existing)
- Event processing happens after verification
- No sensitive data logged in handlers
- Use environment variables for secrets

## 📈 Production Checklist

- [ ] Run database migration
- [ ] Configure polling interval based on expected volume
- [ ] Set up monitoring/alerting for processing lag
- [ ] Test with sample events
- [ ] Monitor logs for errors
- [ ] Set up log aggregation (optional)
- [ ] Consider dead letter queue for failed events (optional)
- [ ] Document any custom event handlers added

## 💡 Next Steps

1. **Run the migration**
2. **Restart your server** (processor starts automatically)
3. **Send a test webhook** from Dialpad
4. **Check processing** with `node scripts/processEvents.js stats`
5. **Query calls table** to verify data

---

For detailed information, see [WEBHOOK_PROCESSING_GUIDE.md](WEBHOOK_PROCESSING_GUIDE.md)
