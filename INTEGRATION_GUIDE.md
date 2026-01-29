# CTI Server Integration Guide

## Overview

Your CTI (Computer Telephony Integration) server is now production-ready for integration with your Base44 CRM application. This guide covers setup, deployment, and integration steps.

## System Architecture

### Core Components

1. **Dialpad OAuth Integration** - Connects your app to Dialpad using OAuth 2.0
2. **Webhook Processing** - Ingests call and message events from Dialpad
3. **WebSocket Server** - Real-time event streaming to connected clients
4. **Calls API** - Read-only API for querying active and historical calls
5. **Internal APIs** - Admin endpoints for key management, user mapping, voicemail operations

### Multi-Tenancy

The system supports multiple applications/organizations:

- Each app has a unique ID, API key, and isolated data
- All database queries are scoped to app_id for security
- WebSocket connections are isolated per app

## Environment Configuration

### Required Variables

Add these to your `.env` file:

```env
# Server
PORT=4000
NODE_ENV=sandbox  # or 'production'
LOG_LEVEL=info    # error, warn, info, debug

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=CTI
DB_MAX_CLIENTS=10

# Dialpad OAuth
CLIENT_ID=your_dialpad_client_id
CLIENT_SECRET=your_dialpad_client_secret
REDIRECT_URI=https://your-domain.com/auth/dialpad/callback
NODE_ENV=sandbox  # Use 'production' for live Dialpad account

# Webhook Verification
DIALPAD_WEBHOOK_SECRET=your_webhook_secret_from_dialpad

# Internal API Protection
INTERNAL_API_SECRET=min-32-characters-secret-key-here

# Optional: Structured Logging
JSON_LOGS=false  # Set to 'true' for JSON format logs
```

## Installation & Deployment

### 1. Local Development Setup

```bash
# Install dependencies
npm install

# Run database migrations
psql "postgresql://postgres:password@localhost:5432/CTI" < migrations/001_webhook_processing.sql
psql "postgresql://postgres:password@localhost:5432/CTI" < migrations/002_production_hardening.sql
psql "postgresql://postgres:password@localhost:5432/CTI" < migrations/003_calls_api_indexes.sql
psql "postgresql://postgres:password@localhost:5432/CTI" < migrations/004_voicemail_and_user_mappings.sql

# Start the server
npm start
# or with auto-reload
nodemon index.js
```

### 2. Health Check

```bash
# Verify server is running
curl http://localhost:4000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-01-28T12:00:00.000Z",
  "uptime": 120.5,
  "environment": "sandbox",
  "port": 4000
}
```

### 3. Configure Dialpad Webhook

In your Dialpad admin panel:

1. Go to **Integrations** → **Webhooks**
2. Set Webhook URL: `https://your-domain.com/webhooks/dialpad`
3. Set Authorization: Header name `x-dialpad-signature`
4. Copy the webhook secret and add to `.env` as `DIALPAD_WEBHOOK_SECRET`
5. Subscribe to events: `call.started`, `call.ring`, `call.ended`, `call.recording.completed`, `voicemail.received`

## API Key Management

### Generate a New API Key

```bash
curl -X POST http://localhost:4000/internal/apps/{app_id}/api-key \
  -H "Authorization: Bearer <your-internal-secret>" \
  -H "Content-Type: application/json"

# Response:
{
  "success": true,
  "api_key": "app_abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My App",
  "rotated_at": "2026-01-28T12:00:00.000Z",
  "note": "Store this key in your .env file. It will never be shown again."
}
```

**Important:**

- The API key is shown ONLY ONCE
- Store it immediately in a secure location (secrets manager, .env, etc.)
- If lost, generate a new key and update all clients
- Keys are never logged or stored in plaintext

### Check API Key Status

```bash
curl -X GET http://localhost:4000/internal/apps/{app_id}/api-key/status \
  -H "Authorization: Bearer <your-internal-secret>"

# Response shows key hint only (first 8 + last 4 chars)
{
  "success": true,
  "key_hint": "app_abcd...cdef",
  "rotated_at": "2026-01-28T12:00:00.000Z",
  "is_active": true
}
```

### Rotate API Key

```bash
curl -X POST http://localhost:4000/internal/apps/{app_id}/api-key/rotate \
  -H "Authorization: Bearer <your-internal-secret>"
```

### View Audit Log

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/api-key/audit?limit=50&offset=0" \
  -H "Authorization: Bearer <your-internal-secret>"

# Response:
{
  "success": true,
  "data": [
    {
      "id": "...",
      "action": "created",
      "old_key_hint": null,
      "new_key_hint": "app_abcd...cdef",
      "performed_at": "2026-01-28T12:00:00.000Z"
    },
    {
      "id": "...",
      "action": "rotated",
      "old_key_hint": "app_1234...5678",
      "new_key_hint": "app_abcd...cdef",
      "performed_at": "2026-01-28T12:30:00.000Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 2, "has_more": false }
}
```

## Calls API

### Query Active Calls

```bash
curl -X GET "http://localhost:4000/api/calls/active?limit=50" \
  -H "x-app-api-key: app_xxxxx..."

# Response:
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "dialpad_call_id": 9876543210,
      "direction": "inbound",
      "from_number": "555-0123",
      "to_number": "555-9876",
      "status": "ringing",
      "dialpad_user_id": 123456,
      "started_at": "2026-01-28T12:00:00Z",
      "duration_seconds": 45,
      "recording_url": null,
      "created_at": "2026-01-28T12:00:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 1, "has_more": false }
}
```

### Filter Calls

```bash
# By status
curl -X GET "http://localhost:4000/api/calls?status=ended" \
  -H "x-app-api-key: app_xxxxx..."

# By direction
curl -X GET "http://localhost:4000/api/calls?direction=inbound" \
  -H "x-app-api-key: app_xxxxx..."

# By phone number
curl -X GET "http://localhost:4000/api/calls?from=555-0123" \
  -H "x-app-api-key: app_xxxxx..."
```

## WebSocket Real-Time Updates

### Connect

```javascript
// In your Base44 app (browser)
const apiKey = process.env.REACT_APP_CTI_API_KEY;
const ws = new WebSocket(`wss://your-domain.com/ws?api_key=${apiKey}`);

ws.onopen = () => {
  console.log("Connected to CTI server");
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Event:", message);

  // Handle different event types
  if (message.event === "call.ring") {
    // Show incoming call notification
    console.log("Incoming call from:", message.from_number);
  } else if (message.event === "call.started") {
    // Call connected
    console.log("Call started with:", message.from_number);
  } else if (message.event === "call.ended") {
    // Call ended
    console.log("Call duration:", message.duration_seconds);
  } else if (message.event === "voicemail.received") {
    // New voicemail
    console.log("Voicemail from:", message.from_number);
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  console.log("Disconnected from CTI server");
  // Attempt to reconnect after 3 seconds
  setTimeout(() => location.reload(), 3000);
};
```

### Event Types

#### call.ring

Incoming call is ringing

```json
{
  "event": "call.ring",
  "timestamp": "2026-01-28T12:00:00Z",
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "dialpad_call_id": 9876543210,
  "from_number": "555-0123",
  "to_number": "555-9876",
  "direction": "inbound",
  "dialpad_user_id": 123456,
  "target_crm_user": "user@example.com"
}
```

#### call.started

Call connected and active

```json
{
  "event": "call.started",
  "timestamp": "2026-01-28T12:00:05Z",
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active"
}
```

#### call.ended

Call disconnected

```json
{
  "event": "call.ended",
  "timestamp": "2026-01-28T12:05:00Z",
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "duration_seconds": 300,
  "recording_url": "https://recordings.dialpad.com/..."
}
```

#### voicemail.received

New voicemail available

```json
{
  "event": "voicemail.received",
  "timestamp": "2026-01-28T12:10:00Z",
  "voicemail_id": "550e8400-e29b-41d4-a716-446655440000",
  "from_number": "555-0123",
  "to_number": "555-9876",
  "dialpad_user_id": 123456,
  "duration_seconds": 45,
  "recording_url": "https://...",
  "transcript": "Hi, this is a test voicemail...",
  "target_crm_user": "user@example.com"
}
```

## User Mapping (Dialpad → CRM)

Map Dialpad user IDs to your CRM user identifiers for call attribution and targeting.

### Create a Mapping

```bash
curl -X POST http://localhost:4000/internal/apps/{app_id}/users/map \
  -H "Authorization: Bearer <your-internal-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "dialpad_user_id": 123456,
    "crm_user_id": "john.doe@example.com"
  }'
```

### List All Mappings

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/users/mappings?limit=50" \
  -H "Authorization: Bearer <your-internal-secret>"
```

### Look Up by Dialpad ID

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/users/mappings/dialpad/123456" \
  -H "Authorization: Bearer <your-internal-secret>"
```

### Look Up by CRM ID

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/users/mappings/crm/john.doe@example.com" \
  -H "Authorization: Bearer <your-internal-secret>"
```

### Bulk Map Users

```bash
curl -X POST http://localhost:4000/internal/apps/{app_id}/users/batch-map \
  -H "Authorization: Bearer <your-internal-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      { "dialpad_user_id": 123456, "crm_user_id": "john@example.com" },
      { "dialpad_user_id": 123457, "crm_user_id": "jane@example.com" },
      { "dialpad_user_id": 123458, "crm_user_id": "bob@example.com" }
    ]
  }'
```

### Delete Mapping

```bash
curl -X DELETE "http://localhost:4000/internal/apps/{app_id}/users/mappings/{mapping_id}" \
  -H "Authorization: Bearer <your-internal-secret>"
```

## Voicemail Management

### List Voicemails

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/voicemails?limit=50&offset=0" \
  -H "Authorization: Bearer <your-internal-secret>"

# Filter by user
curl -X GET "http://localhost:4000/internal/apps/{app_id}/voicemails?dialpad_user_id=123456" \
  -H "Authorization: Bearer <your-internal-secret>"
```

### Get Single Voicemail

```bash
curl -X GET "http://localhost:4000/internal/apps/{app_id}/voicemails/{voicemail_id}" \
  -H "Authorization: Bearer <your-internal-secret>"
```

### Delete Voicemail

```bash
curl -X DELETE "http://localhost:4000/internal/apps/{app_id}/voicemails/{voicemail_id}" \
  -H "Authorization: Bearer <your-internal-secret>"
```

## Monitoring & Maintenance

### Health Endpoint

```bash
# Check server health
curl http://localhost:4000/health

# Response:
{
  "status": "healthy",
  "timestamp": "2026-01-28T12:00:00.000Z",
  "uptime": 3600.5,
  "environment": "sandbox",
  "port": 4000
}
```

### Metrics Endpoint

```bash
# Get memory and performance metrics
curl http://localhost:4000/metrics

# Response:
{
  "timestamp": "2026-01-28T12:00:00.000Z",
  "memory": {
    "heap_used_mb": 45,
    "heap_total_mb": 128,
    "external_mb": 2
  },
  "uptime_seconds": 3600.5
}
```

### Database Connection Test

```bash
# Test database connectivity
node db.js
# Output: "Database connection OK"
```

## Troubleshooting

### Issue: "Missing required environment variables"

**Solution:** Ensure all variables in the Required Variables section above are set in `.env`

### Issue: WebSocket connection refused

**Possible causes:**

- Invalid API key - verify key is correct and hasn't been revoked
- App is inactive - check that the app's `is_active` column is true
- Server not listening on /ws endpoint - restart the server

**Debug:**

```bash
# Check if WebSocket upgrade endpoint is responding
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:4000/ws?api_key=your_key
```

### Issue: Webhooks not being processed

**Possible causes:**

- Webhook signature verification failing - check `DIALPAD_WEBHOOK_SECRET` matches
- Event handler not registered - check logs for "No handler registered"
- Database connection issue - run `node db.js` to test

**Debug:**

```bash
# View event processor stats
curl http://localhost:4000/health
# Check logs for [EventProcessor] messages
```

### Issue: Rate limiting blocking requests

**Check response headers:**

```bash
curl -i http://localhost:4000/api/calls
# Look for RateLimit-* headers
```

**Rate limits:**

- Webhooks: 1000 requests/min
- Calls API: 300 requests/min
- Internal API: 100 requests/min

## Security Best Practices

1. **API Key Storage**
   - Never commit `.env` to version control
   - Store in secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   - Rotate keys every 90 days

2. **WebSocket Security**
   - Always use WSS (secure WebSocket) in production
   - Validate API key before connecting
   - Implement timeout for idle connections

3. **Internal API Protection**
   - Use strong `INTERNAL_API_SECRET` (min 32 characters)
   - Rotate regularly
   - Consider additional protection: VPN, IP whitelisting, mTLS

4. **Database**
   - Use SSL for database connections in production
   - Restrict database access to application servers only
   - Regular backups of voicemail and user mapping tables

5. **Logging**
   - Never log full API keys (uses hints instead)
   - Sanitize PII in logs
   - Aggregate logs to central system (Datadog, CloudWatch)

## Production Deployment Checklist

- [ ] Database migrations applied
- [ ] All required environment variables set
- [ ] `INTERNAL_API_SECRET` is at least 32 characters
- [ ] `DIALPAD_WEBHOOK_SECRET` configured in Dialpad admin
- [ ] SSL certificates configured for HTTPS
- [ ] WebSocket using WSS (secure)
- [ ] Rate limiting configured appropriately
- [ ] Error monitoring enabled (Sentry, etc.)
- [ ] Database backups automated
- [ ] API key rotation schedule established
- [ ] Health check endpoint monitored
- [ ] Logs aggregated to central system
- [ ] Load balancer configured with health check to `/health`
- [ ] Domain name configured and DNS propagated
- [ ] Firewall rules allow inbound on port 443 (HTTPS)

## Integration with Base44

1. **Generate API Key**

   ```bash
   curl -X POST http://your-domain.com/internal/apps/{app_id}/api-key \
     -H "Authorization: Bearer <internal-secret>"
   ```

2. **Configure Base44 .env**

   ```
   REACT_APP_CTI_API_KEY=app_xxxxx...
   REACT_APP_CTI_URL=https://your-domain.com
   ```

3. **Connect WebSocket in React**

   ```javascript
   import { useEffect, useRef } from "react";

   export function useCTIWebSocket() {
     const wsRef = useRef(null);

     useEffect(() => {
       const apiKey = process.env.REACT_APP_CTI_API_KEY;
       wsRef.current = new WebSocket(
         `wss://your-domain.com/ws?api_key=${apiKey}`,
       );

       wsRef.current.onmessage = (event) => {
         const message = JSON.parse(event.data);
         // Handle events
       };

       return () => wsRef.current?.close();
     }, []);

     return wsRef;
   }
   ```

4. **Map Dialpad Users to CRM Users**
   ```javascript
   async function syncUsersFromCRM() {
     const users = await fetchUsersFromCRM();
     const mappings = users.map((user) => ({
       dialpad_user_id: user.dialpad_id,
       crm_user_id: user.email,
     }));

     await fetch("/internal/apps/{app_id}/users/batch-map", {
       method: "POST",
       headers: {
         Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify({ mappings }),
     });
   }
   ```

## Support & Documentation

- **API Reference:** See `EXTENSIONS_API_REFERENCE.md`
- **Architecture Diagrams:** See `EXTENSIONS_ARCHITECTURE_DIAGRAMS.md`
- **Complete Guide:** See `EXTENSIONS_COMPLETE_GUIDE.md`
- **Quick Reference:** See `EXTENSIONS_QUICK_REF.md`
