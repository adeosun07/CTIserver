# Production Deployment Checklist for Your CTI Server

Complete step-by-step checklist to get your CTI server live on Render with full automation.

---

## Phase 1: Pre-Deployment (Local Setup)

### Code Preparation

- [ ] Clone/initialize git repository
- [ ] Push code to GitHub (or your git provider)
- [ ] Verify code builds locally: `npm install && npm start`
- [ ] Test health endpoint: `curl http://localhost:4000/health`

### Local Database Setup

- [ ] PostgreSQL installed and running
- [ ] Database created: `createdb CTI`
- [ ] Schema initialized: `psql -d CTI -f DB_Schema.sql`
- [ ] All migrations run successfully

### Local Environment Configuration

- [ ] `.env` file created with test values
- [ ] `DIALPAD_API_KEY` added (from your Dialpad account)
- [ ] `DIALPAD_WEBHOOK_SECRET` generated and stored
- [ ] `INTERNAL_API_SECRET` generated (32+ chars)
- [ ] `.env` added to `.gitignore` (never commit secrets)

### Local Feature Testing

- [ ] App creation works: `POST /internal/apps`
- [ ] API key generation works: `POST /internal/apps/:app_id/api-key`
- [ ] Webhook creation works locally (or mock test)
- [ ] API endpoints work: `GET /api/calls`

---

## Phase 2: Render Deployment

### Create Render Account & Service

- [ ] Sign up at [render.com](https://render.com)
- [ ] Create new Web Service
- [ ] Connect GitHub repository
- [ ] Auto-deploy enabled (rebuild on git push)

### Configure Web Service Settings

- [ ] Name: `cti-server` (or your preferred name)
- [ ] Environment: `Node`
- [ ] Region: closest to your users
- [ ] Build Command: `npm install`
- [ ] Start Command: `npm start` or `node index.js`

### Add Environment Variables in Render

In Render dashboard, set these variables:

| Variable                    | Value              | Notes                       |
| --------------------------- | ------------------ | --------------------------- |
| `NODE_ENV`                  | `production`       | Enables production mode     |
| `DIALPAD_API_KEY`           | Your API key       | From Dialpad Settings > API |
| `DIALPAD_WEBHOOK_SECRET`    | Your secret        | 32+ char random string      |
| `INTERNAL_API_SECRET`       | Random 32+ chars   | For admin endpoints         |
| `DIALPAD_PROD_REDIRECT_URI` | Your Render domain | Set after first deploy      |
| `DB_HOST`                   | Database host      | See Phase 3                 |
| `DB_PORT`                   | Database port      | Usually 5432                |
| `DB_USER`                   | Database user      | postgres or custom          |
| `DB_PASSWORD`               | Database password  | Secure password             |
| `DB_NAME`                   | Database name      | CTI or custom               |

**Don't set yet:** Wait for database setup in Phase 3

### Deploy and Verify

- [ ] Service created and deployed
- [ ] Check deployment logs for errors
- [ ] Wait for "Deploy live" status
- [ ] Get your domain: `https://cti-server-xxxxx.onrender.com`
- [ ] Save this domain as `DIALPAD_PROD_REDIRECT_URI`

### Test Render Deployment

- [ ] Health check: `curl https://your-render-domain/health`
- [ ] Should return: `{"status":"healthy"}`
- [ ] Check logs in Render dashboard
- [ ] No errors in logs

---

## Phase 3: Database Setup

### Option A: Use Render PostgreSQL

In Render dashboard:

- [ ] Create new PostgreSQL database
- [ ] Name: `CTI` or similar
- [ ] Get connection string
- [ ] Copy to safe location (password included)

### Option B: Use External Database (AWS RDS, Supabase, etc.)

- [ ] Create PostgreSQL database
- [ ] Get connection string: `postgresql://user:password@host:port/database`
- [ ] Ensure Render IPs are whitelisted in firewall

### Initialize Database Schema

After database is created:

```bash
# Using connection string from above
psql "postgresql://user:password@host:port/database" < DB_Schema.sql
psql "postgresql://user:password@host:port/database" < migrations/001_webhook_processing.sql
psql "postgresql://user:password@host:port/database" < migrations/002_production_hardening.sql
psql "postgresql://user:password@host:port/database" < migrations/003_calls_api_indexes.sql
psql "postgresql://user:password@host:port/database" < migrations/004_voicemail_and_user_mappings.sql
psql "postgresql://user:password@host:port/database" < migrations/005_add_calls_raw_payload.sql
```

### Verify Database

- [ ] Connect to database
- [ ] Run: `SELECT table_name FROM information_schema.tables WHERE table_schema='public';`
- [ ] Should see: apps, calls, messages, voicemails, webhook_events, dialpad_webhooks, etc.

### Add Database URL to Render

- [ ] Go back to Render web service environment variables
- [ ] Add `DATABASE_URL` with your full connection string
- [ ] Redeploy: `git push` or redeploy manually
- [ ] Verify in logs that database connection succeeds

---

## Phase 4: Dialpad Configuration

### Get Your API Key

In Dialpad:

- [ ] Log in as admin
- [ ] Navigate to Settings > Admin > Integrations > API
- [ ] Find or create an API key
- [ ] Copy the key
- [ ] Add to Render: `DIALPAD_API_KEY=<your-key>`

### Configure Webhook

In Dialpad:

- [ ] Navigate to Settings > Integrations > Webhooks
- [ ] If webhook exists, edit it. Otherwise create new.
- [ ] Set **hook_url**: `https://your-render-domain/webhooks/dialpad`
- [ ] Set **secret**: Same as `DIALPAD_WEBHOOK_SECRET` in Render env
- [ ] Save

### Verify Dialpad Configuration

- [ ] Dialpad webhook URL points to your Render domain
- [ ] Webhook secret matches `DIALPAD_WEBHOOK_SECRET`
- [ ] Webhook is enabled/active

---

## Phase 5: Automation Setup

### Step 1: Create Your App

```bash
curl -X POST https://your-render-domain/internal/apps \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Production App"}'
```

**Response:**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "api_key": "raw_abc123def456xyz...",
  "message": "App created. Store this API key securely."
}
```

- [ ] App created successfully
- [ ] Save `app_id` (you'll need it for all future requests)
- [ ] Save `api_key` securely (can't be recovered)
- [ ] Verify in database: `SELECT * FROM apps WHERE name='My Production App';`

### Step 2: Create Webhook

```bash
curl -X POST 'https://your-render-domain/internal/webhooks/create?app_id=<YOUR_APP_ID>' \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**

```json
{
  "success": true,
  "webhook_id": 12345678,
  "message": "Webhook created successfully",
  "next_step": "Create subscriptions..."
}
```

- [ ] Webhook created successfully
- [ ] Save `webhook_id`
- [ ] Verify in database: `SELECT * FROM dialpad_webhooks;`

### Step 3: Create Call Subscriptions

In Dialpad:

- [ ] Navigate to Settings > Integrations > Webhooks
- [ ] Find subscription section (or use API)
- [ ] Create subscription for **call events**:

  ```bash
  curl -X POST https://dialpad.com/api/v2/subscriptions/call \
    -H "Authorization: Bearer <YOUR_DIALPAD_API_KEY>" \
    -H "Content-Type: application/json" \
    -d '{
      "webhook_id": 12345678,
      "call_states": ["ringing", "connected", "voicemail", "missed", "hangup"],
      "enabled": true
    }'
  ```

- [ ] Subscription created for calls
- [ ] Verify in Dialpad: subscription shows as "Active"

### Step 4: Create SMS Subscriptions (Optional)

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/sms \
  -H "Authorization: Bearer <YOUR_DIALPAD_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": 12345678,
    "direction": "all",
    "enabled": true,
    "status": true
  }'
```

- [ ] SMS subscription created (or skipped if not needed)

---

## Phase 6: End-to-End Testing

### Test 1: Make a Test Call

- [ ] Use Dialpad to make a test call
- [ ] Call should complete (or use existing call)
- [ ] Check Render logs: should see webhook received
- [ ] Verify no signature verification errors

### Test 2: Verify Webhook Processing

In your database:

```sql
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 1;
```

- [ ] Raw webhook event is stored
- [ ] `processed` should be `false` initially
- [ ] Wait 5 seconds, then check `processed` = `true`

### Test 3: Verify Call Data

```sql
SELECT * FROM calls ORDER BY created_at DESC LIMIT 1;
```

- [ ] Call record exists
- [ ] Contains: call_id, direction, from, to, status, duration
- [ ] Timestamp and duration are correct

### Test 4: Query Via API

```bash
curl -H "x-app-api-key: <YOUR_API_KEY>" \
  https://your-render-domain/api/calls
```

- [ ] Request succeeds (200 OK)
- [ ] Response contains your test call
- [ ] Call data is correct

### Test 5: Check Active Calls

```bash
curl -H "x-app-api-key: <YOUR_API_KEY>" \
  https://your-render-domain/api/calls/active
```

- [ ] Returns empty array or active calls if any
- [ ] No errors

---

## Phase 7: Client Integration

### Provide to Client

Your client needs these values:

- [ ] **App ID**: `550e8400-e29b-41d4-a716-446655440000`
- [ ] **API Key**: `raw_abc123def456xyz...`
- [ ] **CTI Server URL**: `https://your-render-domain`

### Document for Client

- [ ] How to use API key in headers: `-H "x-app-api-key: <key>"`
- [ ] Available endpoints: `/api/calls`, `/api/messages`, `/api/voicemails`
- [ ] Expected response format
- [ ] Rate limits (if any)
- [ ] Support contact info

### Client Testing

- [ ] Client authenticates successfully
- [ ] Client receives call data via API
- [ ] Real-time calls appear in client app
- [ ] Historical calls are queryable

---

## Phase 8: Security Hardening

### Secrets Management

- [ ] All secrets in Render env variables (never in code)
- [ ] `.env` file in `.gitignore`
- [ ] No secrets in git history
- [ ] Rotate `INTERNAL_API_SECRET` regularly

### API Key Security

- [ ] Client API key stored securely in their environment
- [ ] API key never logged to stdout
- [ ] Rate limiting enabled on sensitive endpoints (if configured)
- [ ] Audit logs show all API key rotations

### Database Security

- [ ] Database has strong password
- [ ] Connection uses TLS/SSL
- [ ] Database firewall restricts access
- [ ] Regular backups enabled in Render

### Webhook Security

- [ ] JWT signature verification enabled
- [ ] Webhook secret is 32+ characters
- [ ] Webhook URL is HTTPS only
- [ ] Only your Render domain can receive webhooks

---

## Phase 9: Monitoring & Maintenance

### Setup Monitoring

- [ ] Check Render logs regularly
- [ ] Set up alerts for deployment failures
- [ ] Monitor database connection health
- [ ] Track API response times

### Regular Maintenance

- [ ] Review API key audit logs monthly
- [ ] Update Node.js dependencies: `npm update`
- [ ] Check for security vulnerabilities: `npm audit`
- [ ] Backup database regularly (Render does this automatically)

### Troubleshooting Setup

- [ ] Document common issues and solutions
- [ ] Set up logging for errors
- [ ] Keep Render support contact info handy
- [ ] Monitor Dialpad API status page

---

## Phase 10: Production Sign-Off

### Final Verification

- [ ] All automated features working (app creation, webhook, subscriptions)
- [ ] Webhooks arriving and being processed correctly
- [ ] API responses are fast (< 1 second)
- [ ] No errors in logs
- [ ] Database performing well

### Documentation

- [ ] Client integration guide provided
- [ ] API documentation complete
- [ ] Emergency contacts documented
- [ ] Runbook for common issues created

### Go-Live

- [ ] Client notified that system is live
- [ ] Client completes their end-to-end testing
- [ ] Monitor for first 24 hours
- [ ] Be available for immediate support

---

## ✅ Deployment Complete!

When all checkboxes are complete:

1. ✅ CTI server running on Render
2. ✅ PostgreSQL database connected
3. ✅ Dialpad API key configured
4. ✅ Webhooks automated and tested
5. ✅ App creation, API keys, subscriptions all working
6. ✅ Real calls flowing through to API
7. ✅ Client integrated and testing
8. ✅ Security hardened
9. ✅ Monitoring in place

**Your production CTI server is ready for live use!** 🎉

---

## Quick Reference: Key Endpoints

Once deployed, these endpoints are available:

```bash
# Create app (admin)
POST /internal/apps

# Create webhook (admin)
POST /internal/webhooks/create?app_id=<app_id>

# Query calls (client)
GET /api/calls

# Query messages (client)
GET /api/messages

# Query voicemails (client)
GET /api/voicemails

# Query active calls (client)
GET /api/calls/active

# Health check (public)
GET /health
```

All client endpoints require: `-H "x-app-api-key: <api_key>"`  
All admin endpoints require: `-H "Authorization: Bearer <INTERNAL_API_SECRET>"`

---

## Support Resources

- [COMPLETE_FEATURE_SUMMARY.md](COMPLETE_FEATURE_SUMMARY.md) - Feature overview
- [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md) - Detailed guide
- [WEBHOOK_CREATION_FLOW.md](WEBHOOK_CREATION_FLOW.md) - OAuth & webhook flow
- [OWNER_GUIDE/CTI_SERVER_USAGE.md](OWNER_GUIDE/CTI_SERVER_USAGE.md) - API reference
- Render docs: https://render.com/docs
- Dialpad API docs: https://developers.dialpad.com
