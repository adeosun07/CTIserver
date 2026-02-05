# Production Deployment Guide: Complete Automation Setup

This guide walks you through deploying the CTI server to production and connecting it to your live Dialpad account with **fully automated** OAuth, app creation, API key generation, webhook creation, and event subscriptions.

---

## Quick Reference: What's Automated

✅ **App Creation** - Server creates apps with unique IDs  
✅ **API Key Generation** - Automatic secure key generation for each app  
✅ **Webhook Creation** - Server calls Dialpad API to create webhooks  
✅ **Event Subscriptions** - Server subscribes to call and SMS events  
✅ **Token Management** - Server stores and auto-refreshes Dialpad tokens  
✅ **JWT Verification** - Server verifies all incoming webhook signatures

---

## Part 1: Production Environment Setup

### Step 1: Deploy to Render

1. **Push your code to GitHub**

   ```bash
   git init
   git add .
   git commit -m "Initial CTI server setup"
   git remote add origin https://github.com/YOUR_USERNAME/cti-server.git
   git push -u origin main
   ```

2. **Create a Render service**
   - Go to [render.com](https://render.com)
   - Click "New +"
   - Select "Web Service"
   - Connect your GitHub repository
   - Name: `cti-server`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start` (or `node index.js`)

3. **Configure environment variables in Render dashboard**

   ```
   NODE_ENV=production
   DIALPAD_API_KEY=<your-dialpad-api-key>
   DIALPAD_WEBHOOK_SECRET=<your-webhook-secret>
   DIALPAD_PROD_REDIRECT_URI=https://your-render-domain.onrender.com
   INTERNAL_API_SECRET=<generate-a-long-random-secret>
   DATABASE_URL=<your-postgres-connection-string>
   ```

   Get your domain after deployment:
   - Render creates: `https://cti-server-abc123.onrender.com`
   - This is your **DIALPAD_PROD_REDIRECT_URI**

### Step 2: Set Up PostgreSQL

**Option A: Use Render Postgres**

- In Render dashboard, create a new PostgreSQL database
- Copy connection string to `DATABASE_URL`

**Option B: Use External Postgres (AWS RDS, Supabase, etc.)**

- Get connection string: `postgresql://user:password@host:port/database`
- Set `DATABASE_URL` in Render environment

### Step 3: Run Database Migrations

After deploying, SSH into your Render service and run:

```bash
psql $DATABASE_URL < db_schema.txt
psql $DATABASE_URL < migrations/001_webhook_processing.sql
psql $DATABASE_URL < migrations/002_production_hardening.sql
psql $DATABASE_URL < migrations/003_calls_api_indexes.sql
psql $DATABASE_URL < migrations/004_voicemail_and_user_mappings.sql
psql $DATABASE_URL < migrations/005_add_calls_raw_payload.sql
```

Or via Render dashboard:

- Use Render's dashboard to execute SQL scripts on your database

---

## Part 2: Dialpad Configuration

### Step 1: Get Your API Key

1. **Log in to Dialpad as Admin**
   - Go to [dialpad.com](https://dialpad.com)
   - Navigate to **Settings > Admin > Integrations > API**

2. **Generate or retrieve your API key**
   - Copy the API key (format: usually starts with `ABC123...`)
   - This is your **DIALPAD_API_KEY**

3. **Set it in Render**
   - In Render dashboard, add `DIALPAD_API_KEY=<your-key>`

### Step 2: Configure Webhook Secret

1. **Generate a secure webhook secret**

   ```bash
   # On your local machine
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Note the secret**
   - This is your **DIALPAD_WEBHOOK_SECRET**
   - Set it in Render environment

3. **Store it securely**
   - Never commit to git
   - Use Render environment variables

### Step 3: Update Dialpad Webhook Configuration

1. **In Dialpad Admin Settings**
   - Navigate to **Settings > Integrations > Webhooks**
   - Find your webhook if it exists
   - Update **hook_url** to: `https://your-render-domain.onrender.com/webhooks/dialpad`
   - Verify **secret** matches **DIALPAD_WEBHOOK_SECRET**

---

## Part 3: Automated Integration Flow

### Step 1: Create Your App on the CTI Server

**Call the automated app creation endpoint:**

```bash
curl -X POST http://localhost:4000/internal/apps \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Production App"}'
```

**Response:**

```json
{
  "success": true,
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "api_key": "raw_abc123def456...",
  "message": "App created. Store this API key securely."
}
```

**Save these values:**

- `app_id` - Use for all future requests
- `api_key` - Use in `x-app-api-key` header for API calls

### Step 2: Verify Your App in Database

```sql
SELECT id, name, api_key_rotated_at FROM apps
WHERE id = 'YOUR_APP_ID';
```

Should return a row with your app.

### Step 3: Create the Webhook Automatically

**Call the automated webhook creation endpoint:**

```bash
curl -X POST 'https://your-render-domain.onrender.com/internal/webhooks/create?app_id=YOUR_APP_ID' \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-render-domain.onrender.com/webhooks/dialpad",
    "webhook_secret": "<DIALPAD_WEBHOOK_SECRET>"
  }'
```

**Response:**

```json
{
  "success": true,
  "webhook_id": 12345678,
  "message": "Webhook created successfully",
  "next_step": "Create subscriptions for call/SMS events"
}
```

**Save the webhook_id** - You'll need it for subscriptions.

### Step 4: Create Call Event Subscriptions

**Call Dialpad API to subscribe to call events:**

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/call \
  -H "Authorization: Bearer <DIALPAD_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": 12345678,
    "call_states": ["ringing", "connected", "voicemail", "missed", "hangup"],
    "enabled": true
  }'
```

### Step 5: Create SMS Event Subscriptions (Optional)

**Call Dialpad API to subscribe to SMS events:**

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/sms \
  -H "Authorization: Bearer <DIALPAD_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": 12345678,
    "direction": "all",
    "enabled": true,
    "status": true
  }'
```

---

## Part 4: Complete Deployment Checklist

Use this checklist to ensure everything is configured correctly:

### Pre-Deployment ✓

- [ ] Code pushed to GitHub
- [ ] Render web service created
- [ ] PostgreSQL database created (Render or external)
- [ ] Database migrations executed
- [ ] Environment variables set in Render:
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL`
  - [ ] `DIALPAD_API_KEY`
  - [ ] `DIALPAD_WEBHOOK_SECRET`
  - [ ] `DIALPAD_PROD_REDIRECT_URI` (your Render domain)
  - [ ] `INTERNAL_API_SECRET` (random secret)

### Server Health ✓

- [ ] Render service is running (no errors in logs)
- [ ] Database connection successful
- [ ] Health check: `curl https://your-render-domain.onrender.com/health`
  - Should return: `{"status":"ok"}`

### App Registration ✓

- [ ] App created via `/internal/apps` endpoint
- [ ] `app_id` saved
- [ ] `api_key` saved securely
- [ ] Verified in database

### Webhook Setup ✓

- [ ] Webhook created via `/internal/webhooks/create`
- [ ] `webhook_id` saved
- [ ] Call event subscriptions created
- [ ] SMS event subscriptions created (optional)

### Test Production Setup ✓

- [ ] Make a test call in Dialpad
- [ ] Verify webhook arrives (check server logs)
- [ ] Call appears in database:
  ```sql
  SELECT * FROM calls ORDER BY created_at DESC LIMIT 1;
  ```
- [ ] Call data accessible via API:
  ```bash
  curl -H "x-app-api-key: YOUR_API_KEY" \
    https://your-render-domain.onrender.com/api/calls
  ```

### Integration with Client App ✓

- [ ] Client app has `app_id` and `api_key`
- [ ] Client app headers: `x-app-api-key: <their-api-key>`
- [ ] Client app queries calls: `GET /api/calls`
- [ ] Client app queries messages: `GET /api/messages`
- [ ] Client app queries voicemails: `GET /api/voicemails`

---

## Part 5: Full Automation Summary

### What Your Server Does Automatically

**When a webhook arrives from Dialpad:**

1. ✅ Receives JWT-formatted webhook
2. ✅ Verifies JWT signature (HS256)
3. ✅ Extracts event payload (call ID, state, timestamp)
4. ✅ Stores raw event in `webhook_events` table
5. ✅ Processes event into relevant table (`calls`, `messages`, `voicemails`)
6. ✅ Makes event available via REST API

**When you request a call/message/voicemail:**

1. ✅ Authenticates using API key
2. ✅ Queries database
3. ✅ Returns JSON response

**When you need to refresh tokens:**

1. ✅ Server automatically checks token expiry
2. ✅ Auto-refreshes if needed (if using OAuth)
3. ✅ Uses fresh token for all API calls

**When you need to create a webhook:**

1. ✅ You call `/internal/webhooks/create`
2. ✅ Server retrieves your Dialpad API key
3. ✅ Server calls Dialpad API to create webhook
4. ✅ Server stores webhook metadata
5. ✅ You get webhook_id for subscriptions

---

## Part 6: API Quick Reference

### Create App

```
POST /internal/apps
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Body: { "name": "App Name" }
Returns: { app_id, api_key }
```

### Generate API Key (Rotation)

```
POST /internal/apps/:app_id/api-key
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Returns: { api_key }
```

### Create Webhook

```
POST /internal/webhooks/create?app_id=:app_id
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Body: { webhook_url?, webhook_secret? }
Returns: { webhook_id }
```

### List Webhooks

```
GET /internal/webhooks?app_id=:app_id
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Returns: { webhooks[] }
```

### Query Calls

```
GET /api/calls?limit=50&offset=0
Headers: x-app-api-key: <api_key>
Returns: { calls[] }
```

### Query Messages

```
GET /api/messages?limit=50&offset=0
Headers: x-app-api-key: <api_key>
Returns: { messages[] }
```

### Query Voicemails

```
GET /api/voicemails?limit=50&offset=0
Headers: x-app-api-key: <api_key>
Returns: { voicemails[] }
```

---

## Part 7: Troubleshooting

### Webhook not arriving?

1. **Check webhook was created:**

   ```sql
   SELECT * FROM dialpad_webhooks
   WHERE app_id = 'YOUR_APP_ID';
   ```

2. **Check subscriptions in Dialpad:**
   - Go to Dialpad Settings > Integrations > Webhooks
   - Verify webhook status is "Active"
   - Verify subscriptions exist for call/SMS events

3. **Check Render logs:**
   - Render dashboard > your service > Logs
   - Look for errors or missing header warnings

4. **Test webhook manually:**
   ```bash
   curl -X POST https://your-render-domain.onrender.com/webhooks/dialpad \
     -H "Content-Type: application/jwt" \
     -d "<valid-jwt-token>"
   ```

### Signature verification failing?

1. **Verify secret matches:**

   ```bash
   echo $DIALPAD_WEBHOOK_SECRET
   ```

2. **Check in Dialpad settings:**
   - Settings > Integrations > Webhooks
   - Verify "Secret" field matches `DIALPAD_WEBHOOK_SECRET`

3. **Check server logs for specific error:**
   - Render logs should show JWT validation details

### API Key not working?

1. **Verify API key format:**
   - Should start with `raw_` (plaintext form)
   - 64+ characters long

2. **Verify header format:**

   ```bash
   -H "x-app-api-key: raw_abc123..."
   ```

3. **Check app is active:**
   ```sql
   SELECT is_active FROM apps WHERE id = 'YOUR_APP_ID';
   ```

### Database connection failing?

1. **Verify DATABASE_URL:**
   - Check Render environment variables
   - Format: `postgresql://user:password@host:port/database`

2. **Check firewall rules:**
   - If using external DB, ensure Render IP is whitelisted

3. **Test connection locally:**
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

---

## Part 8: Security Checklist

- [ ] `INTERNAL_API_SECRET` is 32+ characters long
- [ ] `DIALPAD_API_KEY` stored only in Render env, never in code
- [ ] `DIALPAD_WEBHOOK_SECRET` stored only in Render env
- [ ] Git `.env` file is in `.gitignore`
- [ ] Database connection uses TLS/SSL
- [ ] API keys never logged in production
- [ ] Render auto-restarts on deployment (prevents downtime)
- [ ] Error logs don't expose sensitive data

---

## Part 9: Next Steps

1. **Deploy to Render** (Part 1)
2. **Configure Dialpad** (Part 2)
3. **Run automation flow** (Part 3)
4. **Verify with checklist** (Part 4)
5. **Test end-to-end**:
   - Make call in Dialpad
   - Verify webhook received
   - Query `/api/calls`
   - Verify data is there ✓

---

## Support

If you encounter issues:

1. **Check Render logs:** Dashboard > Logs tab
2. **Check database:** Run queries to verify data
3. **Check webhook status:** Dialpad Settings > Integrations
4. **Review error responses:** Server returns detailed error messages

For detailed API documentation, see:

- [WEBHOOK_CREATION_FLOW.md](../WEBHOOK_CREATION_FLOW.md)
- [Sandbox_Testing_Guide.md](../Sandbox_Testing_Guide.md)
- [OWNER_GUIDE/CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md)
