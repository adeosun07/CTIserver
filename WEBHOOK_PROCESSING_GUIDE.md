# Webhook Event Processing - Integration Guide

## Overview

This system processes webhook events from the `webhook_events` table using a service-oriented architecture.

## Components Created

### 1. SQL Migration (`migrations/001_webhook_processing.sql`)

- Adds `processed_at` column to `webhook_events` table
- Creates indexes for efficient querying
- Adds unique constraint on `dialpad_event_id` for idempotency

### 2. Event Processor Service (`services/dialpadEventProcessor.js`)

Core processing engine that:

- Fetches unprocessed events from database
- Routes events to registered handlers by `event_type`
- Marks events as processed after successful handling
- Supports both one-time and continuous polling modes

### 3. Call Event Handlers (`services/callEventHandlers.js`)

Implements handlers for call lifecycle events:

- `call.started` → Insert/update call with status='active'
- `call.ring` → Insert/update call with status='ringing'
- `call.ended` → Update call with status='ended', ended_at, duration
- `call.recording.completed` → Attach recording_url to call

All handlers use UPSERT operations for idempotency.

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Connect to your PostgreSQL database and run:
psql -U your_user -d your_database -f migrations/001_webhook_processing.sql
```

Or programmatically:

```javascript
import fs from "fs";
import pool from "./db.js";

const migration = fs.readFileSync(
  "./migrations/001_webhook_processing.sql",
  "utf8",
);
await pool.query(migration);
```

### Step 2: Initialize Event Processor in Your Application

Update `index.js` to start the event processor:

```javascript
import "dotenv/config";
import express from "express";
import cors from "cors";

import dialpadAuthRouter from "./routes/dialpadAuth.js";
import webhooksRouter from "./routes/webhooks.js";

// Import event processing
import { startEventProcessor } from "./services/dialpadEventProcessor.js";
import { registerCallHandlers } from "./services/callEventHandlers.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/", (req, res) => {
  res.json({ message: "CTI Server is running" });
});

app.use("/auth/dialpad", dialpadAuthRouter);
app.use("/webhooks", webhooksRouter); // Make sure webhooks route is registered

// Initialize event processing
registerCallHandlers(); // Register all call event handlers

// Start the event processor with 5-second polling interval
const stopProcessor = startEventProcessor({
  intervalMs: 5000, // Poll every 5 seconds
  batchSize: 50, // Process up to 50 events per batch
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  stopProcessor();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Webhook event processor started`);
});
```

### Step 3: Verify Webhooks Route is Active

Make sure `routes/webhooks.js` is properly set up:

```javascript
import express from "express";
import { handleDialpadWebhook } from "../controllers/webhookController.js";

const router = express.Router();

router.post("/dialpad", handleDialpadWebhook);

export default router;
```

## Usage Patterns

### One-Time Processing (Manual)

```javascript
import { processWebhookEvents } from "./services/dialpadEventProcessor.js";

// Process all unprocessed events once
const stats = await processWebhookEvents();
console.log(`Processed: ${stats.processed}, Failed: ${stats.failed}`);

// Process with limits
const stats2 = await processWebhookEvents({
  batchSize: 10,
  maxEvents: 100,
});
```

### Continuous Processing (Recommended for Production)

```javascript
import { startEventProcessor } from "./services/dialpadEventProcessor.js";

// Start continuous polling
const stop = startEventProcessor({
  intervalMs: 5000, // Check every 5 seconds
  batchSize: 50, // Process up to 50 events per batch
});

// Later, to stop:
stop();
```

### Get Processing Statistics

```javascript
import { getProcessingStats } from "./services/dialpadEventProcessor.js";

const stats = await getProcessingStats();
console.log(stats);
// {
//   unprocessed: '15',
//   processed: '1234',
//   event_types: '4',
//   oldest_unprocessed: '2026-01-27T10:30:00Z'
// }
```

## Adding New Event Types

To add support for a new event type (e.g., `sms.received`):

1. Create a handler function:

```javascript
// services/smsEventHandlers.js
import pool from "../db.js";
import { registerEventHandler } from "./dialpadEventProcessor.js";

async function handleSmsReceived(payload, app_id) {
  const { id, from, to, text, sent_at } = payload;

  await pool.query(
    `INSERT INTO messages (
       app_id, dialpad_message_id, direction, from_number, to_number, text, sent_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dialpad_message_id) DO NOTHING`,
    [app_id, id, "inbound", from, to, text, sent_at],
  );
}

export function registerSmsHandlers() {
  registerEventHandler("sms.received", handleSmsReceived);
  console.log("[SmsHandlers] Registered SMS handlers");
}
```

2. Register it in `index.js`:

```javascript
import { registerSmsHandlers } from "./services/smsEventHandlers.js";

// After registerCallHandlers()
registerSmsHandlers();
```

## Architecture Decisions

### Why Separate Ingestion and Processing?

1. **Resilience**: Webhook endpoint always responds quickly (< 100ms)
2. **Retry Logic**: Failed processing doesn't lose the webhook
3. **Scalability**: Processing can be scaled independently
4. **Debugging**: Easier to replay events or test handlers

### Why Polling Instead of Queue?

- Simple deployment (no Redis/RabbitMQ required)
- Good enough for < 1000 events/minute
- Database as single source of truth
- Easy to monitor and debug

For higher volume (> 5000 events/min), consider migrating to a message queue.

### Idempotency Guarantees

- `dialpad_call_id` UNIQUE constraint prevents duplicate calls
- `dialpad_event_id` UNIQUE constraint prevents duplicate webhook ingestion
- UPSERT operations (ON CONFLICT) make handlers safe to retry
- Failed events remain unprocessed and will retry

## Monitoring

Check processing health:

```javascript
import { getProcessingStats } from "./services/dialpadEventProcessor.js";

setInterval(async () => {
  const stats = await getProcessingStats();
  if (stats.unprocessed > 100) {
    console.warn(`Processing lag: ${stats.unprocessed} unprocessed events`);
  }
}, 60000); // Check every minute
```

Check database directly:

```sql
-- Unprocessed events by type
SELECT event_type, COUNT(*)
FROM webhook_events
WHERE processed_at IS NULL
GROUP BY event_type;

-- Processing lag
SELECT
  COUNT(*) as unprocessed,
  MIN(received_at) as oldest,
  MAX(received_at) as newest
FROM webhook_events
WHERE processed_at IS NULL;
```

## Error Handling

### Failed Events

Events that fail processing are NOT marked as processed. They will be retried on the next polling cycle.

To manually mark failed events as processed:

```sql
-- Mark specific event as processed (skip it)
UPDATE webhook_events
SET processed_at = now()
WHERE id = 'some-uuid';

-- Mark all old failures as processed (cleanup)
UPDATE webhook_events
SET processed_at = now()
WHERE processed_at IS NULL
  AND received_at < now() - interval '7 days';
```

### Unknown Event Types

Events with no registered handler are logged and marked as processed to avoid repeated warnings.

## Testing

Test individual handlers:

```javascript
import { handleCallStarted } from "./services/callEventHandlers.js";

const mockPayload = {
  call: {
    id: 123456789,
    direction: "inbound",
    from: "+15551234567",
    to: "+15559876543",
    started_at: new Date().toISOString(),
  },
};

const mockAppId = "your-app-uuid";

await handleCallStarted(mockPayload, mockAppId);
```

Test event processor with real database:

```javascript
// Insert a test event
await pool.query(
  `INSERT INTO webhook_events (app_id, event_type, dialpad_event_id, payload)
   VALUES ($1, $2, $3, $4)`,
  ["your-app-uuid", "call.started", "test-event-123", mockPayload],
);

// Process it
const stats = await processWebhookEvents({ batchSize: 1 });
console.log(stats); // Should show 1 processed
```

## Environment Variables

None required specifically for event processing. Existing variables:

- `DATABASE_URL` or individual DB connection vars (from db.js)
- `DIALPAD_WEBHOOK_SECRET` (for webhook verification in controller)

## Production Considerations

1. **Polling Interval**: Adjust based on volume
   - Low volume (< 100/hour): 10-30 seconds
   - Medium volume (< 1000/hour): 5 seconds
   - High volume: Consider message queue

2. **Batch Size**:
   - Smaller batches (10-20) = More frequent DB hits, faster individual event processing
   - Larger batches (50-100) = More efficient, but slower to see results

3. **Database Indexes**: Already included in migration

4. **Logging**: Consider structured logging (e.g., Winston, Pino)

5. **Monitoring**: Set up alerts for processing lag

6. **Dead Letter Queue**: For production, consider moving repeatedly-failed events to a separate table after N retries
