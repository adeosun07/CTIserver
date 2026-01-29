# Security Hardening - Quick Testing Guide

## Summary of Changes

All 10 critical security requirements have been implemented and tested:

1. ✅ PKCE (Proof Key for Code Exchange) - Authorization code protection
2. ✅ Token Deauthorization - /disconnect endpoint for token revocation
3. ✅ API Key Hashing - bcrypt with "raw\_" prefix for plaintext keys
4. ✅ OAuth Rate Limiting - 10 attempts per 15 minutes on auth endpoints
5. ✅ Webhook Signature Enforcement - MANDATORY signature verification
6. ✅ OAuth Input Validation - UUID, app existence, active status checks
7. ✅ Authorization Event Logging - Structured JSON logging for audit trail
8. ✅ Refresh Token Validation - Enforces offline_access scope requirement
9. ✅ HTTPS Enforcement - Auto-redirect HTTP to HTTPS in production
10. ✅ Session Configuration - Secure PKCE verifier storage with httpOnly cookies

---

## Quick Testing Commands

### 1. Test OAuth Flow with PKCE

**Start the server:**

```bash
npm start
```

**Initiate OAuth (terminal 1):**

```bash
curl -v http://localhost:4000/auth/dialpad/connect?app_id=<YOUR_APP_UUID>
```

**Expected Response:**

- 302 redirect to Dialpad OAuth URL
- URL includes: `code_challenge` and `code_challenge_method=S256`
- Confirms PKCE is working ✓

---

### 2. Test API Key Generation and Hashing

**Generate API key:**

```bash
curl -X POST \
  http://localhost:4000/internal/apps/<APP_UUID>/api-key \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**Expected Response:**

```json
{
  "api_key": "raw_a1b2c3d4e5f6...",
  "warning": "Store this immediately - it will never be shown again"
}
```

**Verify key is hashed in database:**

```bash
psql -h localhost -U postgres -d CTI -c "SELECT api_key FROM apps WHERE id='<APP_UUID>';"
```

**Expected Output:**

```
           api_key
────────────────────────────────────
 $2b$10$6Vv5k8z9n2m1p0q9...  <- bcrypt hash (not plaintext)
```

---

### 3. Test Webhook Signature Verification

**Test with VALID signature:**

```bash
# Calculate HMAC-SHA256
SECRET="<DIALPAD_WEBHOOK_SECRET>"
BODY='{"event":"test"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

# Send webhook
curl -X POST http://localhost:4000/webhooks/dialpad \
  -H "x-dialpad-signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$BODY"

# Expected: 200 OK
```

**Test with INVALID signature:**

```bash
curl -X POST http://localhost:4000/webhooks/dialpad \
  -H "x-dialpad-signature: invalid_signature" \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'

# Expected: 401 Unauthorized
# Response: {"error": "Invalid webhook signature"}
```

---

### 4. Test OAuth Rate Limiting

**Trigger rate limit (11 failed requests in 15 minutes):**

```bash
for i in {1..12}; do
  curl http://localhost:4000/auth/dialpad/connect?app_id=invalid-uuid
  echo "Request $i"
  sleep 2
done
```

**Expected on 11th+ request:**

```
HTTP 429 Too Many Requests
{"error": "Too many OAuth attempts. Please try again later."}
```

---

### 5. Test Input Validation

**Invalid UUID:**

```bash
curl http://localhost:4000/auth/dialpad/connect?app_id=not-a-uuid
# Expected: 400 Bad Request - "Invalid app_id format"
```

**Non-existent app:**

```bash
curl http://localhost:4000/auth/dialpad/connect?app_id=550e8400-e29b-41d4-a716-446655440000
# Expected: 404 Not Found - "App not found"
```

**Inactive app:**

```bash
# Assuming you have an app with is_active = false
curl http://localhost:4000/auth/dialpad/connect?app_id=<INACTIVE_APP_UUID>
# Expected: 403 Forbidden - "App is disabled"
```

---

### 6. Test Authorization Event Logging

**Check logs for OAuth events:**

```bash
# Start server with debug logging
LOG_LEVEL=debug npm start
```

**Expected log entries when completing OAuth:**

```
[INFO] OAuth authorization initiated { app_id: "...", app_name: "MyApp" }
[INFO] OAuth token exchanged successfully { expires_in: 3600, ... }
[INFO] Token refreshed successfully { expires_in: 3600, ... }
[WARN] Webhook rejected - invalid signature { ip: "192.168.1.1" }
```

---

### 7. Test Token Deauthorization

**Disconnect app and revoke tokens:**

```bash
curl -X POST \
  http://localhost:4000/auth/dialpad/disconnect/<APP_UUID> \
  -H "Authorization: Bearer <INTERNAL_API_SECRET>"
```

**Expected Response:**

```json
{
  "message": "App successfully disconnected from Dialpad",
  "app_id": "<APP_UUID>"
}
```

**Verify tokens deleted from database:**

```bash
psql -h localhost -U postgres -d CTI -c "SELECT * FROM dialpad_connections WHERE app_id='<APP_UUID>';"
# Expected: No rows
```

---

### 8. Test HTTPS Enforcement (Production)

**Set production environment:**

```bash
NODE_ENV=production npm start
```

**Test HTTP redirect:**

```bash
curl -I -L http://localhost:4000/health
# Expected: Fails (unless reverse proxy terminates HTTPS)
```

**Test with HTTPS proxy header:**

```bash
curl -I http://localhost:4000/health \
  -H "x-forwarded-proto: https"
# Expected: 200 OK + HSTS header
```

**Verify HSTS header:**

```bash
curl -I http://localhost:4000/health -H "x-forwarded-proto: https" | grep Strict-Transport-Security
# Expected: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

### 9. Test Session/PKCE Protection

**Check session secure attributes:**

```bash
# Session cookie should have:
# - HttpOnly: true (prevents JavaScript access)
# - Secure: true in production (HTTPS only)
# - SameSite: lax (CSRF protection)
# - MaxAge: 15 minutes

# Verify in browser DevTools > Application > Cookies
```

---

### 10. Test Scopes Configuration

**Verify scopes in authorization request:**

```bash
curl -v http://localhost:4000/auth/dialpad/connect?app_id=<APP_UUID> 2>&1 | grep "scope="
# Expected: scope=calls:list%20recordings_export%20offline_access
```

**Verify refresh token in callback:**

```javascript
// In OAuth callback response, check:
// data.refresh_token exists (required for offline_access)
// data.access_token exists
// data.token_type === "bearer"
// data.expires_in > 0
```

---

## Environment Variable Checklist

Before running tests, verify:

```bash
# Check .env file
grep -E "^(NODE_ENV|DIALPAD_|INTERNAL_API_SECRET)" .env

# Expected output:
NODE_ENV=sandbox
DIALPAD_SANDBOX_REDIRECT_URI=https://...
DIALPAD_PROD_REDIRECT_URI=https://...
DIALPAD_WEBHOOK_SECRET=...
INTERNAL_API_SECRET=...
DIALPAD_SCOPES="calls:list recordings_export offline_access"
```

---

## Files Modified

| File                     | Changes                               | Lines |
| ------------------------ | ------------------------------------- | ----- |
| dialpadAuthController.js | PKCE, disconnect, validation, logging | +300  |
| apiKeyController.js      | bcrypt hashing, validation, logging   | +200  |
| webhookController.js     | Signature enforcement, logging        | +80   |
| index.js                 | Session, rate limiting, HTTPS         | +50   |
| routes/dialpadAuth.js    | Disconnect route                      | +5    |
| .env                     | Multiple redirect URIs, scopes        | +10   |

**Total: 645 lines of security code added**

---

## Verification Commands

Run these to verify all changes:

```bash
# 1. Check syntax
node -c index.js && echo "✓ index.js"
node -c controllers/dialpadAuthController.js && echo "✓ dialpadAuthController.js"
node -c controllers/apiKeyController.js && echo "✓ apiKeyController.js"
node -c controllers/webhookController.js && echo "✓ webhookController.js"

# 2. Check dependencies
npm list bcrypt express-session && echo "✓ Dependencies installed"

# 3. Check environment setup
grep -E "DIALPAD_SCOPES|INTERNAL_API_SECRET" .env && echo "✓ Environment configured"

# 4. Start server
npm start
# Should show: "✓ All required environment variables configured"
#              "✓ Database connection verified"
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Change `SESSION_SECRET` to a strong random value (32+ chars)
- [ ] Change `INTERNAL_API_SECRET` to a strong random value (32+ chars)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `DIALPAD_PROD_REDIRECT_URI` with your domain
- [ ] Move all secrets to environment variables (not .env)
- [ ] Enable HTTPS on server
- [ ] Configure reverse proxy to forward `x-forwarded-proto: https`
- [ ] Test OAuth flow with production credentials
- [ ] Test webhook signatures with production secret
- [ ] Configure monitoring/alerting for security events
- [ ] Backup database before first production deployment
- [ ] Test disaster recovery procedures

---

## Support

For implementation details, see: [SECURITY_HARDENING_IMPLEMENTATION.md](./SECURITY_HARDENING_IMPLEMENTATION.md)

For full integration guide, see: [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

For API reference, see: [CALLS_API_DOCUMENTATION.md](./CALLS_API_DOCUMENTATION.md)
