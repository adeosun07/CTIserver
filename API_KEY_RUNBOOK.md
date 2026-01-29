# API Key Management Runbook

## Quick Reference

**Location:** `/internal/apps/{app_id}/api-key`

**Authentication:** Requires `Authorization: Bearer {INTERNAL_API_SECRET}` header

**Key Format:** `app_` prefix + 64 random hex characters (256-bit entropy)

**Retrieval:** Keys are shown ONCE only during generation - cannot be recovered if lost

---

## Procedures

### 1. Generate New API Key (First-Time Setup)

Use this when:

- Setting up a new application
- Needing initial API key for development/testing

**Command:**

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key \
  -H "Authorization: Bearer your-internal-secret" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "success": true,
  "message": "API key created successfully. Store this securely - it cannot be retrieved again.",
  "api_key": "app_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "app_name": "My CRM App",
  "rotated_at": "2026-01-28T12:00:00Z",
  "note": "Store this key in your .env file. It will never be shown again."
}
```

**CRITICAL STEPS:**

1. Copy the full `api_key` value immediately
2. Store in secure location:
   - Development: `.env` file (NOT in git)
   - Production: AWS Secrets Manager, HashiCorp Vault, etc.
3. Do NOT log or email the key
4. Update all clients that need the key
5. Verify clients can authenticate before closing this ticket

---

### 2. Check API Key Status (Without Revealing Key)

Use this to:

- Verify a key is still active
- See when it was last rotated
- Get the key hint for identification

**Command:**

```bash
curl -X GET \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/status \
  -H "Authorization: Bearer your-internal-secret"
```

**Response:**

```json
{
  "success": true,
  "key_hint": "app_a1b2c3d4...c9d0",
  "rotated_at": "2026-01-28T12:00:00Z",
  "is_active": true
}
```

---

### 3. Rotate API Key (Scheduled or Emergency)

**Scheduled Rotation (every 90 days):**

1. Generate new key (see procedure #1)
2. Update all clients with new key
3. Old key automatically becomes invalid
4. Check audit log to confirm rotation

**Emergency Rotation (compromised key):**

1. Immediately revoke the key (procedure #4)
2. Generate new key
3. Update all clients with new key
4. Monitor for unauthorized access attempts in logs

**Command:**

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key \
  -H "Authorization: Bearer your-internal-secret" \
  -H "Content-Type: application/json"
```

**Response:** (same as generation - new key is shown)

**Post-Rotation Checklist:**

- [ ] New key received and stored securely
- [ ] All clients updated with new key
- [ ] Test clients can authenticate with new key
- [ ] Old key no longer works (if revoked separately)
- [ ] Audit log shows rotation event
- [ ] No errors in application logs

---

### 4. Revoke API Key (Disable Access)

Use this to:

- Disable a compromised key
- Remove access for a client
- Prevent further authentication attempts

**Command:**

```bash
curl -X POST \
  http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/revoke \
  -H "Authorization: Bearer your-internal-secret" \
  -H "Content-Type: application/json"
```

**Response:**

```json
{
  "success": true,
  "message": "API key revoked successfully",
  "app_id": "550e8400-e29b-41d4-a716-446655440000",
  "revoked_at": "2026-01-28T12:05:00Z",
  "note": "All API requests using this key will be rejected. Generate a new key if access is still needed."
}
```

**IMPORTANT:**

- Revocation is immediate - all clients lose access
- Have new key ready before revoking (unless emergency)
- Old key becomes completely inaccessible
- Cannot be undone - must generate new key

---

### 5. View API Key Audit Log

Use this to:

- Track all key rotations and revocations
- Verify compliance with rotation schedule
- Identify unusual activity

**Command:**

```bash
curl -X GET \
  "http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/audit?limit=50&offset=0" \
  -H "Authorization: Bearer your-internal-secret"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "action": "created",
      "old_key_hint": null,
      "new_key_hint": "app_a1b2c3d4...c9d0",
      "performed_at": "2026-01-28T12:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "action": "rotated",
      "old_key_hint": "app_a1b2c3d4...c9d0",
      "new_key_hint": "app_z9y8x7w6...b2a1",
      "performed_at": "2026-01-28T14:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "action": "revoked",
      "old_key_hint": "app_z9y8x7w6...b2a1",
      "new_key_hint": null,
      "performed_at": "2026-01-28T15:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 3,
    "has_more": false
  }
}
```

**Compliance Check:**

```bash
# Show all rotations in last 90 days
curl -X GET \
  "http://localhost:4000/internal/apps/550e8400-e29b-41d4-a716-446655440000/api-key/audit?limit=100" \
  -H "Authorization: Bearer your-internal-secret" \
  | jq '.data[] | select(.performed_at > now - 7776000) | .action'
```

---

## Troubleshooting

### "Invalid app_id"

- Verify UUID format is correct (36 characters with hyphens)
- Check app exists: `SELECT id FROM apps WHERE id = '...'`
- Ensure `INTERNAL_API_SECRET` matches environment

### "API key generation failed"

- Check database connection is working
- Verify `apps` table has `api_key` column
- Check `api_key_audit_log` table exists

### "Missing Authorization header"

- Include header: `Authorization: Bearer <secret>`
- Verify `INTERNAL_API_SECRET` is correct
- Check header name is exactly `Authorization`

### "Invalid authentication token"

- Verify `INTERNAL_API_SECRET` value in .env
- Check for extra whitespace or quotes
- Ensure it's at least 32 characters

### Application says "Invalid API key"

- Verify client is using correct key
- Check key wasn't revoked: `curl /api-key/status`
- Confirm app is active: `SELECT is_active FROM apps WHERE id = '...'`
- Check if key was recently rotated (old key no longer valid)

---

## Scheduled Maintenance

### Daily

- Monitor error logs for authentication failures
- Check for any revoked keys being used (will show 401 errors)

### Weekly

- Review audit log for unusual activity
- Verify all clients are using valid keys

### Monthly

- Generate summary of key rotations for compliance
- Review and update access for inactive clients

### Quarterly (90 days)

- Schedule key rotation for all production apps
- Execute rotation and verify clients update their keys
- Document completion in change log

---

## Security Guidelines

### Key Storage Tiers

**Development:**

```
.env file (git-ignored)
├── Safe: Local development only
├── At risk: If laptop is stolen
└── Recovery: Regenerate key
```

**Staging:**

```
Environment variables set on server
├── Safe: Protected by server security groups
├── At risk: Server compromise
└── Recovery: Regenerate key and redeploy
```

**Production:**

```
Secrets manager (AWS/Azure/Vault)
├── Safe: Encrypted at rest, audit trail
├── At risk: Internal compromise
└── Recovery: Rotate key immediately
```

### Access Control

| Role      | Can Generate | Can View Hint | Can Revoke |
| --------- | :----------: | :-----------: | :--------: |
| DevOps    |      ✓       |       ✓       |     ✓      |
| Eng Lead  |      ✓       |       ✓       |     ✓      |
| Developer |      ✗       |       ✗       |     ✗      |
| DBA       |      ✗       |       ✓       |     ✗      |
| Support   |      ✗       |       ✓       |     ✗      |

### Incident Response

**If key is compromised:**

1. **Immediately (< 5 min):**

   ```bash
   curl -X POST .../api-key/revoke -H "Authorization: Bearer ..."
   ```

2. **Within 15 minutes:**
   - Generate new key
   - Update all affected clients
   - Monitor logs for unauthorized access

3. **Within 1 hour:**
   - Investigate logs for unauthorized access
   - Document incident and timeline
   - Notify security team

4. **End of day:**
   - Post-mortem: how was key compromised?
   - Update security practices if needed
   - Update runbook with lessons learned

---

## Scripts & Automation

### Bash Script: Rotate All Keys for an Organization

```bash
#!/bin/bash
# rotate_all_keys.sh - Rotate keys for multiple apps

INTERNAL_SECRET="${INTERNAL_API_SECRET}"
CTI_URL="${CTI_SERVER_URL:-http://localhost:4000}"
APPS=(
  "550e8400-e29b-41d4-a716-446655440000"
  "550e8400-e29b-41d4-a716-446655440001"
  "550e8400-e29b-41d4-a716-446655440002"
)

for APP_ID in "${APPS[@]}"; do
  echo "Rotating key for app: $APP_ID"

  RESPONSE=$(curl -s -X POST \
    "$CTI_URL/internal/apps/$APP_ID/api-key" \
    -H "Authorization: Bearer $INTERNAL_SECRET" \
    -H "Content-Type: application/json")

  NEW_KEY=$(echo "$RESPONSE" | jq -r '.api_key')

  if [ "$NEW_KEY" != "null" ]; then
    echo "✓ New key: ${NEW_KEY:0:12}..."
    # TODO: Update secrets manager
  else
    echo "✗ Failed: $(echo "$RESPONSE" | jq -r '.error')"
  fi
done
```

### Python Script: Check Key Status for Multiple Apps

```python
#!/usr/bin/env python3
import requests
import json

CTI_URL = "http://localhost:4000"
INTERNAL_SECRET = os.environ["INTERNAL_API_SECRET"]
APPS = ["app-id-1", "app-id-2", "app-id-3"]

headers = {
    "Authorization": f"Bearer {INTERNAL_SECRET}",
    "Content-Type": "application/json"
}

for app_id in APPS:
    resp = requests.get(
        f"{CTI_URL}/internal/apps/{app_id}/api-key/status",
        headers=headers
    )
    data = resp.json()

    if resp.status_code == 200:
        print(f"✓ {app_id}: {data['key_hint']} (rotated: {data['rotated_at']})")
    else:
        print(f"✗ {app_id}: {data['error']}")
```

---

## Contact & Escalation

- **On-Call Engineer:** [On-call Slack channel]
- **Security Team:** security@company.com
- **DevOps Team:** devops@company.com
- **Database Team:** dba@company.com

---

**Last Updated:** January 28, 2026  
**Version:** 1.0  
**Status:** Production Ready
