# Webhook Configuration Guide

This guide explains how to configure `webhook_url` and `secret` for Dialpad webhooks in your CTI server.

## Overview

When you create a webhook in Dialpad, you need to provide:

1. **webhook_url** - The HTTPS URL where Dialpad sends events
2. **secret** - A shared secret used to sign webhook payloads for verification

Your server automatically stores these values in the database when webhooks are received.

---

## Step 1: Configure Your Environment Variables

### Set the Webhook Secret in `.env`

Open your `.env` file and ensure you have `DIALPAD_WEBHOOK_SECRET` configured:

```dotenv
# Dialpad Webhook Secret - Used to verify webhook signatures
DIALPAD_WEBHOOK_SECRET=your-secret-key-here
```

**Best Practices for the Secret:**

- Use a strong, random string (minimum 32 characters)
- Use alphanumeric characters and special characters
- Never hardcode secrets - always use environment variables
- Rotate secrets periodically

**Generate a Secure Secret:**

```bash
# On macOS/Linux:
openssl rand -hex 32

# On Windows PowerShell:
[System.Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))
```

---

## Step 2: Determine Your Webhook URL

Your webhook URL must be **publicly accessible** over HTTPS.

### Development Environment (with ngrok)

If you're using ngrok for local development:

```
https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad
```

Your server listens for webhooks at `POST /webhooks/dialpad`

**Steps to set up ngrok:**

```bash
# 1. Install ngrok
npm install -g ngrok

# 2. Start your server
npm start

# 3. In another terminal, expose port 4000
ngrok http 4000

# Copy the HTTPS URL provided by ngrok
```

### Production Environment

For production, use your actual domain:

```
https://your-domain.com/webhooks/dialpad
```

Make sure:

- Your domain has a valid SSL certificate
- Port 443 (HTTPS) is publicly accessible
- Dialpad servers can reach your URL (firewall rules)

---

## Step 3: Create a Webhook in Dialpad

### Using the Dialpad API

Send a POST request to create the webhook:

```bash
curl --request POST \
  --url https://dialpad.com/api/v2/webhooks \
  --header 'accept: application/json' \
  --header 'authorization: Bearer YOUR_DIALPAD_API_TOKEN' \
  --header 'content-type: application/json' \
  --data '{
    "hook_url": "https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad",
    "secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5"
  }'
```

**Response Example:**

```json
{
  "id": 12345,
  "hook_url": "https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad",
  "signature": {
    "algo": "HS256",
    "secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5",
    "type": "jwt"
  }
}
```

**Save the `webhook_id`** (in this case: `12345`) - You'll need it for subscriptions.

---

## Step 4: Webhook Signature Verification

### How Your Server Verifies Webhooks

When Dialpad sends events, it includes a signature header. Your server verifies this signature to ensure the event came from Dialpad:

```javascript
// From webhookController.js
function verifySignature(rawBody, signature) {
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(String(signature)),
  );
}
```

**Signature Verification Process:**

1. Dialpad signs the webhook payload with your secret using HMAC-SHA256
2. Dialpad sends the signature in the `x-dialpad-signature` header
3. Your server recalculates the signature using the same secret
4. If signatures match, the webhook is authentic ✓

### Signature Header Format

Dialpad sends:

```
x-dialpad-signature: base64-encoded-signature
```

Your server looks for this header and validates it against the request body.

---

## Step 5: Automatic Webhook Metadata Storage

Once your server receives the first webhook event, it automatically stores the webhook metadata in the database:

```sql
-- Stored in dialpad_webhooks table:
- webhook_id (BIGINT) - Unique ID from Dialpad
- hook_url (TEXT) - The webhook URL
- secret (TEXT) - The signature secret
- algo (TEXT) - Algorithm (HS256)
- signature_type (TEXT) - Type (jwt)
- app_id (UUID) - Associated app
```

---

## Step 6: Create Event Subscriptions

After creating the webhook, subscribe to events you want to receive:

```bash
curl --request POST \
  --url https://dialpad.com/api/v2/subscriptions \
  --header 'authorization: Bearer YOUR_DIALPAD_API_TOKEN' \
  --header 'content-type: application/json' \
  --data '{
    "webhook_id": 12345,
    "event_types": [
      "call.ring",
      "call.started",
      "call.ended",
      "call.held",
      "voicemail.created"
    ]
  }'
```

**Note:** You MUST have the `webhook_id` from Step 3 to create subscriptions.

---

## Testing Your Webhook

### View Stored Webhooks

```bash
curl -X GET "http://localhost:4000/internal/webhooks?app_id=your-app-id" \
  -H "Authorization: Bearer your-internal-secret"
```

**Response:**

```json
{
  "success": true,
  "count": 1,
  "webhooks": [
    {
      "id": "uuid-here",
      "app_id": "your-app-id",
      "webhook_id": 12345,
      "hook_url": "https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad",
      "secret": "5f7d3f1e2b8c4a6e9c3f2b1a4d6e7f8g...",
      "algo": "HS256",
      "signature_type": "jwt",
      "created_at": "2026-02-04T12:00:00Z",
      "updated_at": "2026-02-04T12:00:00Z"
    }
  ]
}
```

### Test Webhook Event Receipt

Use the test script provided:

```bash
node scripts/generateTestEvents.js
```

This generates test webhook events to verify your signature verification works correctly.

---

## Environment Variables Summary

| Variable                       | Purpose                               | Example                                                     |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------- |
| `DIALPAD_WEBHOOK_SECRET`       | Secret for signing/verifying webhooks | `5f7d3f1e2b8c4a6e...`                                       |
| `DIALPAD_SANDBOX_REDIRECT_URI` | Dev/sandbox webhook URL               | `https://neutral-wasp-calm.ngrok-free.app/webhooks/dialpad` |
| `DIALPAD_PROD_REDIRECT_URI`    | Production webhook URL                | `https://your-domain.com/webhooks/dialpad`                  |

---

## Common Issues & Troubleshooting

### ❌ Webhooks Not Being Received

**Check:**

1. Is your `hook_url` publicly accessible?

   ```bash
   curl -X POST https://your-url/webhooks/dialpad \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

2. Is HTTPS enforced? Dialpad only sends to HTTPS URLs.

3. Check ngrok is still running and forwarding:
   ```bash
   ngrok http 4000
   ```

### ❌ Signature Verification Failed

**Check:**

1. Is `DIALPAD_WEBHOOK_SECRET` in `.env` exactly matching what you used to create the webhook?

   ```bash
   echo $DIALPAD_WEBHOOK_SECRET
   ```

2. Restart your server after changing the secret:

   ```bash
   npm start
   ```

3. Check the server logs for signature errors:
   ```
   Webhook rejected - invalid signature
   ```

### ❌ Webhook Stored with `NULL` Values

If you see webhooks with `NULL` secrets or URLs, it means Dialpad didn't include that data in the event. This typically means:

1. The webhook_id wasn't in the payload structure we expected
2. You're receiving a different event type than expected

Check the raw payload in the `webhook_events` table to debug.

---

## Security Best Practices

### ✓ Do

- ✅ Use strong, random secrets (minimum 32 characters)
- ✅ Store secrets in environment variables, never in code
- ✅ Verify webhook signatures on every request
- ✅ Use HTTPS for all webhook URLs
- ✅ Rotate secrets periodically
- ✅ Log webhook events for debugging
- ✅ Rate limit webhook processing if needed

### ✗ Don't

- ❌ Share your webhook secret
- ❌ Commit secrets to version control
- ❌ Use HTTP (insecure) URLs
- ❌ Skip signature verification
- ❌ Use predictable/weak secrets
- ❌ Log sensitive payload data

---

## API Reference

### Create Webhook

```
POST https://dialpad.com/api/v2/webhooks
Body: { "hook_url": "...", "secret": "..." }
Returns: { "id": webhook_id, ... }
```

### Create Subscription

```
POST https://dialpad.com/api/v2/subscriptions
Body: { "webhook_id": 12345, "event_types": [...] }
```

### List Your Webhooks

```
GET http://localhost:4000/internal/webhooks?app_id=your-app-id
Headers: { "Authorization": "Bearer your-internal-secret" }
```

### Delete Webhook Record

```
DELETE http://localhost:4000/internal/webhooks/12345
Headers: { "Authorization": "Bearer your-internal-secret" }
```

---

## Next Steps

1. ✅ Generate a secure secret
2. ✅ Set `DIALPAD_WEBHOOK_SECRET` in `.env`
3. ✅ Determine your webhook URL (ngrok for dev, domain for prod)
4. ✅ Create a webhook via Dialpad API
5. ✅ Create event subscriptions
6. ✅ Test webhook receipt and signature verification
7. ✅ Monitor webhook events in your database

Your CTI server is now ready to receive and process Dialpad webhooks!
