# 📖 OWNER GUIDE - Complete Index for Rebecca

All files in this folder are numbered for **sequential reading order**.

---

## Reading Path for Rebecca

### ⭐ **Start Here (5 min)**

**[00_FOR_REBECCA_START_HERE.md](00_FOR_REBECCA_START_HERE.md)**

- Your complete 5-step workflow
- What your app needs to do
- Key endpoints
- Setup in 5 minutes

### Step 1: API Quick Start (10 min)

**[01_QUICK_START_API_REFERENCE.md](01_QUICK_START_API_REFERENCE.md)**

- How to use each endpoint
- Request/response examples
- Authentication headers
- Error handling

### Step 2: All Endpoints (10 min)

**[02_ENDPOINT_REFERENCE.md](02_ENDPOINT_REFERENCE.md)**

- Detailed endpoint documentation
- Query parameters
- Response formats
- Status codes

### Step 3: Architecture (10 min)

**[03_SYSTEM_ARCHITECTURE.md](03_SYSTEM_ARCHITECTURE.md)**

- How the system works
- Component diagrams
- Data flow
- Integration architecture

### Step 4: Production Workflow (15 min)

**[04_PRODUCTION_WORKFLOW.md](04_PRODUCTION_WORKFLOW.md)**

- Production deployment
- Environment setup
- Render configuration
- Going live

### Step 5: Testing (10 min)

**[05_LOCAL_TESTING_GUIDE.md](05_LOCAL_TESTING_GUIDE.md)**

- Sandbox testing
- Postman setup
- Phase-by-phase testing
- Verification steps

### Reference: Complete Guide

**[06_COMPLETE_OWNER_GUIDE.md](06_COMPLETE_OWNER_GUIDE.md)**

- Comprehensive reference
- All features explained
- Troubleshooting
- Advanced topics

---

## Quick Navigation by Task

### "I want to integrate my app"

→ [00_FOR_REBECCA_START_HERE.md](00_FOR_REBECCA_START_HERE.md) → [01_QUICK_START_API_REFERENCE.md](01_QUICK_START_API_REFERENCE.md)

### "I need to call an endpoint"

→ [02_ENDPOINT_REFERENCE.md](02_ENDPOINT_REFERENCE.md)

### "I want to understand the system"

→ [03_SYSTEM_ARCHITECTURE.md](03_SYSTEM_ARCHITECTURE.md)

### "I'm deploying to production"

→ [04_PRODUCTION_WORKFLOW.md](04_PRODUCTION_WORKFLOW.md)

### "I want to test first"

→ [05_LOCAL_TESTING_GUIDE.md](05_LOCAL_TESTING_GUIDE.md)

### "I need complete reference"

→ [06_COMPLETE_OWNER_GUIDE.md](06_COMPLETE_OWNER_GUIDE.md)

---

## The 5-Minute Integration (for Rebecca)

1. **Create your app:**

   ```bash
   POST /internal/apps
   → Save: app_id, api_key
   ```

2. **Create webhook (server does this):**

   ```bash
   POST /internal/webhooks/create?app_id=<APP_ID>
   → Save: webhook_id
   ```

3. **Subscribe to events (you do this in Dialpad):**

   ```bash
   POST https://dialpad.com/api/v2/subscriptions/call
   → Use: webhook_id
   ```

4. **Make a test call in Dialpad**
   → Server receives & processes automatically

5. **Query the API:**
   ```bash
   GET /api/calls (with x-app-api-key header)
   → Get: Your call data ✅
   ```

**Total time: ~5 minutes**

---

## File Descriptions

| File                              | Purpose                | Audience              | Time      |
| --------------------------------- | ---------------------- | --------------------- | --------- |
| `00_FOR_REBECCA_START_HERE.md`    | Your complete workflow | Rebecca (integrators) | 5 min     |
| `01_QUICK_START_API_REFERENCE.md` | How to use endpoints   | Developers            | 10 min    |
| `02_ENDPOINT_REFERENCE.md`        | Detailed API docs      | Developers            | 10 min    |
| `03_SYSTEM_ARCHITECTURE.md`       | System design          | Architects            | 10 min    |
| `04_PRODUCTION_WORKFLOW.md`       | Deploy to production   | DevOps                | 15 min    |
| `05_LOCAL_TESTING_GUIDE.md`       | Test before deploy     | QA/Testers            | 10 min    |
| `06_COMPLETE_OWNER_GUIDE.md`      | Everything (reference) | All                   | Reference |

---

## Key Concepts

### App ID + API Key

- **app_id**: Unique identifier for your application
- **api_key**: Authentication token (returned once, cannot be recovered)
- **How to use**: Add `x-app-api-key: <api_key>` header to API requests

### Webhook ID

- **webhook_id**: Dialpad's identifier for this webhook
- **Where it comes from**: Created when you call `/internal/webhooks/create`
- **What you do with it**: Use it when creating subscriptions in Dialpad

### Internal Secret

- **INTERNAL_API_SECRET**: Secret for admin endpoints
- **Used for**: `/internal/apps`, `/internal/webhooks/create`
- **How to use**: `Authorization: Bearer <INTERNAL_API_SECRET>` header

---

## Next Steps

1. **Read:** [00_FOR_REBECCA_START_HERE.md](00_FOR_REBECCA_START_HERE.md)
2. **Understand:** [01_QUICK_START_API_REFERENCE.md](01_QUICK_START_API_REFERENCE.md)
3. **Implement:** Follow the 5-minute setup
4. **Deploy:** Use [04_PRODUCTION_WORKFLOW.md](04_PRODUCTION_WORKFLOW.md)

---

## Support

- **Questions about setup?** → [00_FOR_REBECCA_START_HERE.md](00_FOR_REBECCA_START_HERE.md)
- **Confused about endpoints?** → [02_ENDPOINT_REFERENCE.md](02_ENDPOINT_REFERENCE.md)
- **Want to understand the architecture?** → [03_SYSTEM_ARCHITECTURE.md](03_SYSTEM_ARCHITECTURE.md)
- **Ready to go live?** → [04_PRODUCTION_WORKFLOW.md](04_PRODUCTION_WORKFLOW.md)

---

**Welcome! Start with [00_FOR_REBECCA_START_HERE.md](00_FOR_REBECCA_START_HERE.md)** 👉
