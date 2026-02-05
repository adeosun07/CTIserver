# For Rebecca: Complete API-Key Integration Workflow

> **🎉 SERVER IS LIVE AND READY**  
> Your CTI server is deployed on Render at: **https://ctiserver.onrender.com**  
> All systems operational. You can start the 5-minute setup below.

This document outlines the **exact workflow** for integrating with the CTI server using the **API-key approach** (no OAuth required).

---

## The Complete Flow

### What Your App Does (In Order)

```
STEP 1: Create App
┌─────────────────────────────────────────────────┐
│ Your app hits CTI server                        │
│ POST /internal/apps                             │
│ Headers: Authorization: Bearer <INTERNAL_SECRET>│
│ Body: { "name": "My App" }                     │
│                                                 │
│ Response:                                       │
│ {                                               │
│   "app_id": "550e8400-e29b-41d4-a716-...",     │
│   "api_key": "raw_abc123def456xyz...",         │
│   "message": "Store this API key securely"     │
│ }                                               │
│                                                 │
│ ✅ Save app_id and api_key                     │
└─────────────────────────────────────────────────┘
                         ↓

STEP 2: Create Webhook (Server Uses Your API Key)
┌─────────────────────────────────────────────────┐
│ Your app hits CTI server                        │
│ POST /internal/webhooks/create?app_id=<APP_ID> │
│ Headers: Authorization: Bearer <INTERNAL_SECRET>│
│                                                 │
│ CTI server automatically:                       │
│ 1. Reads DIALPAD_API_KEY from .env              │
│ 2. Calls Dialpad API to create webhook          │
│ 3. Stores webhook metadata in database          │
│ 4. Returns webhook_id to you                    │
│                                                 │
│ Response:                                       │
│ {                                               │
│   "webhook_id": 12345678,                       │
│   "message": "Webhook created successfully"    │
│ }                                               │
│                                                 │
│ ✅ Save webhook_id                             │
└─────────────────────────────────────────────────┘
                         ↓

STEP 3: Create Subscriptions (You Call Dialpad)
┌─────────────────────────────────────────────────┐
│ Your app calls Dialpad API directly:            │
│                                                 │
│ POST https://dialpad.com/api/v2/subscriptions/call
│ Headers:                                        │
│   Authorization: Bearer <YOUR_DIALPAD_API_KEY> │
│   Content-Type: application/json                │
│ Body: {                                         │
│   "webhook_id": 12345678,                       │
│   "call_states": [                             │
│     "ringing", "connected", "hangup"           │
│   ],                                            │
│   "enabled": true                              │
│ }                                               │
│                                                 │
│ (Optional) SMS subscriptions:                   │
│ POST https://dialpad.com/api/v2/subscriptions/sms
│ Body: {                                         │
│   "webhook_id": 12345678,                       │
│   "direction": "all",                          │
│   "enabled": true,                             │
│   "status": true                               │
│ }                                               │
│                                                 │
│ ✅ Subscriptions now active                    │
└─────────────────────────────────────────────────┘
                         ↓

STEP 4: Dialpad Starts Sending Events Automatically
┌─────────────────────────────────────────────────┐
│ When a call happens in Dialpad:                 │
│                                                 │
│ Dialpad → POST /webhooks/dialpad                │
│           (to your CTI server)                  │
│           Content-Type: application/jwt         │
│           Body: {JWT with call data}            │
│                                                 │
│ CTI server automatically:                       │
│ 1. Receives JWT webhook                         │
│ 2. Verifies HS256 signature                     │
│ 3. Extracts call details                        │
│ 4. Stores in database                           │
│ 5. Processes every 5 seconds                    │
│                                                 │
│ ✅ Event processed and stored                  │
└─────────────────────────────────────────────────┘
                         ↓

STEP 5: Your App Queries Call Data
┌─────────────────────────────────────────────────┐
│ Your app hits CTI server:                       │
│                                                 │
│ GET /api/calls                                  │
│ Headers: x-app-api-key: <YOUR_API_KEY>         │
│                                                 │
│ Response:                                       │
│ {                                               │
│   "calls": [                                    │
│     {                                           │
│       "call_id": 5963972419002368,             │
│       "direction": "outbound",                 │
│       "from": "+13342459504",                  │
│       "to": "+13345521280",                    │
│       "status": "completed",                   │
│       "duration": 5000,                        │
│       "started_at": "2025-02-04T22:11:49Z"    │
│     },                                         │
│     ...                                        │
│   ]                                            │
│ }                                               │
│                                                 │
│ ✅ Call data ready for your dashboard          │
└─────────────────────────────────────────────────┘
```

---

## What You Need

### From Your Dialpad Account

- **Your Dialpad API Key** - From Settings > Admin > Integrations > API
- **Your Dialpad Organization ID** - Usually visible in Dialpad settings

### On the CTI Server (Render)

Already configured by the team:

- `DIALPAD_API_KEY` - Your API key (in .env)
- `DIALPAD_WEBHOOK_SECRET` - For webhook verification
- `INTERNAL_API_SECRET` - For admin endpoints like `/internal/apps` and `/internal/webhooks/create`
- `CTI_SERVER_URL` - Your Render domain

---

## The 5-Minute Setup

### Minute 1: Create App

```bash
curl -X POST https://ctiserver.onrender.com/internal/apps \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Rebecca App"}'

# Response: Save app_id and api_key
```

### Minute 2: Create Webhook

```bash
curl -X POST 'https://ctiserver.onrender.com/internal/webhooks/create?app_id=<APP_ID>' \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"

# Response: Save webhook_id
```

### Minute 3: Subscribe to Call Events

```bash
curl -X POST https://dialpad.com/api/v2/subscriptions/call \
  -H "Authorization: Bearer <YOUR_DIALPAD_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_id": <WEBHOOK_ID>,
    "call_states": ["ringing", "connected", "hangup"],
    "enabled": true
  }'
```

### Minute 4: Make Test Call

- Make a call in Dialpad
- Server receives webhook automatically
- Event processed

### Minute 5: Query the API

```bash
curl -H "x-app-api-key: <YOUR_API_KEY>" \
  https://ctiserver.onrender.com/api/calls

# Response: Your test call with all details
```

---

## Key Endpoints You'll Use

### Step 1: Create App (Admin)

```
POST /internal/apps
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Body: { "name": "Your App Name" }
Response: { app_id, api_key }
```

### Step 2: Create Webhook (Admin)

```
POST /internal/webhooks/create?app_id=<app_id>
Headers: Authorization: Bearer <INTERNAL_API_SECRET>
Response: { webhook_id }
```

### Step 3-5: Use These (Client)

```
GET /api/calls
GET /api/messages
GET /api/voicemails
GET /api/calls/active
Headers: x-app-api-key: <your-api-key>
```

---

## Important Notes

### No OAuth Required

- The API-key approach doesn't need OAuth
- Your CTI server uses your Dialpad API key internally
- No redirect URIs needed for event delivery
- Webhook URL is: `https://ctiserver.onrender.com/webhooks/dialpad`

### Webhook Delivery

- **NOT via OAuth redirect**
- Dialpad sends events directly to the webhook URL
- URL is registered when webhook is created
- Events arrive automatically as JWT

### Security

- Your API key is stored in `.env` on Render (never exposed)
- Your app uses the `api_key` returned in Step 1
- Dialpad webhooks are verified with HS256 signature
- Multi-tenant: each app_id is isolated

---

## What Happens Behind the Scenes

```
You create webhook (Step 2)
  ↓
CTI server uses your DIALPAD_API_KEY to call:
POST https://dialpad.com/api/v2/webhooks
Body: {
  "hook_url": "https://ctiserver.onrender.com/webhooks/dialpad",
  "secret": "DIALPAD_WEBHOOK_SECRET"
}
  ↓
Dialpad returns webhook_id
  ↓
CTI server saves webhook_id in database
  ↓
Now Dialpad knows: "Send events to this URL"
  ↓
When call happens: Dialpad → CTI server webhook endpoint
  ↓
CTI server verifies signature, processes, stores data
  ↓
Your app queries /api/calls and gets the data
```

---

## Troubleshooting

### Webhook not arriving?

- Check subscriptions are created (verified in Dialpad settings)
- Verify webhook URL is correct: `https://ctiserver.onrender.com/webhooks/dialpad`
- Check server logs in Render dashboard

### API key not working?

- Make sure header is exactly: `x-app-api-key: <key>`
- Key should start with `raw_`
- App must be active in database

### Call data not appearing?

- Make a new test call (existing calls won't retroactively appear)
- Check webhook subscriptions are for the right webhook_id
- Verify `call_states` includes the state you're testing (e.g., "connected")

---

## Next Steps

1. **Read:** [01_QUICK_START.md](01_QUICK_START.md) - 5 min overview
2. **Read:** [02_API_REFERENCE.md](02_API_REFERENCE.md) - Endpoint details
3. **Read:** [03_ARCHITECTURE.md](03_ARCHITECTURE.md) - How it all works
4. **Do:** Execute the 5-minute setup above
5. **Test:** Make a call and verify via API
6. **Deploy:** Use in production

---

**Everything is set up. You just need to hit the endpoints in order. That's it!** ✅
