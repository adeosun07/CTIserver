# CTI Server

**Real-time call integration platform for Dialpad**

A production-ready, multi-tenant Node.js server that bridges your internal systems with Dialpad's cloud telephony platform. Receive call events in real-time, manage OAuth tokens, and provide a unified API for call data and webhooks.

---

## � Documentation

**For complete production setup and integration guide, start here:**

### 🔴 **[COMPLETE_FEATURE_SUMMARY.md](COMPLETE_FEATURE_SUMMARY.md)** ← START HERE

Everything you need to know: app creation, API key generation, webhook automation, event subscriptions, JWT verification.

### 🟠 **[PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md)**

Step-by-step guide to deploy to Render with complete checklist and troubleshooting.

### 🟡 **[WEBHOOK_CREATION_FLOW.md](WEBHOOK_CREATION_FLOW.md)**

Deep dive into how webhooks are created automatically and OAuth flow explanation.

### Other Guides

- [OWNER_GUIDE/INTEGRATION_ARCHITECTURE.md](OWNER_GUIDE/INTEGRATION_ARCHITECTURE.md) - System architecture
- [OWNER_GUIDE/CTI_SERVER_USAGE.md](OWNER_GUIDE/CTI_SERVER_USAGE.md) - API reference
- [Sandbox_Testing_Guide.md](Sandbox_Testing_Guide.md) - Development testing

---

## �🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([install](https://nodejs.org/))
- **PostgreSQL** 12+ ([install](https://www.postgresql.org/download/))
- **Dialpad Account** with API access

### 1. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd CTIserver

# Install dependencies
npm install

# Create database
createdb CTI

# Initialize schema
psql -d CTI -f DB_Schema.sql
```

### 2. Configuration

Create a `.env` file in the project root:

```env
# Server
PORT=4000
NODE_ENV=sandbox

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=CTI

# ⭐ PRIMARY: Dialpad API Key (for single Dialpad organization)
# Get from Dialpad Settings > Integrations > API
DIALPAD_API_KEY=your-dialpad-api-key

# Webhooks & Security
DIALPAD_WEBHOOK_SECRET=your-webhook-secret
INTERNAL_API_SECRET=your-internal-api-secret

# Server URLs
DIALPAD_PROD_REDIRECT_URI=https://localhost:4000  # or your Render domain in production

# ⚠️ OPTIONAL: Dialpad OAuth (only needed if supporting multiple Dialpad orgs)
# DIALPAD_SANDBOX_CLIENT_ID=your-client-id
# DIALPAD_SANDBOX_CLIENT_SECRET=your-client-secret
# DIALPAD_SANDBOX_REDIRECT_URI=https://localhost:4000/auth/dialpad/callback
```

**Key Configuration Notes:**

- **`DIALPAD_API_KEY`**: Your Dialpad admin API key (primary method)
  - Get from Dialpad Settings > Admin > Integrations > API
  - Server uses this for all Dialpad API calls
  - Perfect for single-organization setup

- **`DIALPAD_WEBHOOK_SECRET`**: Secret for webhook signature verification
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Must match webhook secret configured in Dialpad
  - Never commit to git

- **`INTERNAL_API_SECRET`**: Secret for internal management endpoints
  - Used to authenticate admin API calls
  - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Required for app creation, webhook creation, API key management

- **OAuth credentials** (optional): Only needed if you want to support multiple Dialpad organizations
  - Most deployments use the API key approach instead

### 3. Start the Server

```bash
# Development
npm start

# Production
NODE_ENV=production npm start
```

**Expected Output:**

```
✓ All required environment variables configured
Server running on http://localhost:4000
✓ Database connection successful
WebSocket server initialized
```

### 4. Verify Health

```bash
curl http://localhost:4000/health

# Response:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-30T12:00:00.000Z"
# }
```

---

## 📖 Documentation

| Document                                                                 | Purpose                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| **[CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md)**                           | Architecture, workflows, sandbox vs production setup |
| **[CTI_SERVER_API.md](CTI_SERVER_API.md)**                               | Complete API endpoint reference with examples        |
| **[CTI_SERVER_OWNER_GUIDE.md](documentation/CTI_SERVER_OWNER_GUIDE.md)** | Operations, monitoring, scaling, troubleshooting     |
| **[PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md)**                     | Backend integration workflows, voicemail handling    |
| **[LOCAL_TESTING_GUIDE.md](documentation/LOCAL_TESTING_GUIDE.md)**       | How to test locally with Postman                     |
| **[DB_Schema.sql](DB_Schema.sql)**                                       | Complete database schema for deployment              |

---

## ✨ Features

### Core Capabilities

- **Real-time webhooks** from Dialpad (calls, voicemail)
- **Call event processing** (ring, answer, hold, end)
- **Multi-tenant isolation** (separate apps with isolated data)
- **OAuth 2.0 with PKCE** (secure authorization)
- **API key management** (bcrypt hashed, one-time delivery)
- **WebSocket subscriptions** (real-time notifications)
- **REST APIs** for querying call history
- **Voicemail handling** (transcripts, recordings)
- **Audit logging** (all operations tracked)
- **Production security** (HMAC signatures, CSRF protection)

### What You Get

✅ Incoming call webhooks  
✅ Screen pop / contact lookup APIs  
✅ Call logs with full history  
✅ Call status events (real-time)  
✅ Voicemail transcripts & audio URLs  
✅ User/agent mapping  
✅ API key rotation & revocation  
✅ Health monitoring endpoints

### What You Implement

Your backend handles:

- Contact lookup in your CRM
- Activity/call logging in your system
- Phone ringing (softphone integration)
- Task/ticket creation
- User notifications
- Custom call routing logic

---

## 🏗️ Architecture

```
Dialpad Webhooks
    ↓
    ├─→ HMAC Signature Validation
    ├─→ Queue in webhook_events table
    ├─→ Event Processor (every 5 seconds)
    │   └─→ Process & insert into calls/voicemails
    │   └─→ Push WebSocket notifications
    ↓
Your Backend
    ├─→ WebSocket: Receive real-time events
    ├─→ REST API: Query call history
    ├─→ OAuth: Automatic token refresh
    └─→ Integrate with CRM, contact center, etc.
```

---

## 🔐 Security

- **API Keys**: Bcrypt hashed (cost factor 10), one-time delivery, no recovery
- **Webhooks**: HMAC-SHA256 signature verification
- **OAuth**: PKCE flow, automatic token refresh, session isolation
- **Database**: Connection pooling, prepared statements (SQL injection safe)
- **HTTPS**: Required in production (enforced)
- **Audit Trail**: All authentication events logged

---

## 📊 API Overview

### Health & Status

```bash
GET /health                    # Health check
GET /metrics                   # System metrics (requires Bearer auth)
```

### Call Management

```bash
GET /api/calls                 # List all calls
GET /api/calls/active          # Get active calls
GET /api/calls/{id}            # Get specific call
```

### Authentication & Keys

```bash
POST /internal/apps                    # Create app (requires Bearer auth)
POST /internal/apps/{id}/api-key       # Generate API key
GET /internal/apps/{id}/api-key/status # Check key status
```

### OAuth & Webhooks

```bash
GET /authorize?app_id=...                  # Initiate OAuth
GET /auth/dialpad/callback                 # OAuth redirect endpoint
POST /webhooks/dialpad                     # Receive webhooks
WS /ws                                     # WebSocket subscriptions
```

For complete endpoint documentation, see [CTI_SERVER_API.md](CTI_SERVER_API.md).

---

## 🧪 Testing

### Local Testing with Postman

1. Import [LOCAL_TESTING_GUIDE.md](documentation/LOCAL_TESTING_GUIDE.md)
2. Set environment variables in Postman
3. Run tests in sequence:
   - Health check
   - Generate API key
   - Create user mapping
   - Send webhook (simulated call)
   - Query active calls

### Run Tests

```bash
npm test
```

---

## 🚀 Deployment

### Development

```bash
npm start
```

### Production (Docker)

```bash
docker build -t cti-server .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DB_HOST=postgres.example.com \
  -e INTERNAL_API_SECRET=your-secret \
  cti-server
```

### Production (Kubernetes, AWS, etc.)

See [CTI_SERVER_OWNER_GUIDE.md](documentation/CTI_SERVER_OWNER_GUIDE.md#deployment--infrastructure) for detailed deployment instructions.

---

## 📋 Project Structure

```
CTIserver/
├── controllers/              # Request handlers
│   ├── apiKeyController.js
│   ├── callsController.js
│   ├── dialpadAuthController.js
│   ├── webhookController.js
│   └── voicemailController.js
├── middleware/              # Authentication & validation
│   ├── apiKeyAuth.js
│   └── internalAuth.js
├── routes/                  # Express routes
│   ├── calls.js
│   ├── dialpadAuth.js
│   ├── internal.js
│   └── webhooks.js
├── services/                # Business logic
│   ├── callEventHandlers.js
│   ├── callsService.js
│   ├── dialpadEventProcessor.js
│   ├── userMappingService.js
│   ├── voicemailService.js
│   └── websocketManager.js
├── migrations/              # Database migrations
│   ├── 001_webhook_processing.sql
│   ├── 002_production_hardening.sql
│   ├── 003_calls_api_indexes.sql
│   ├── 004_voicemail_and_user_mappings.sql
│   └── 005_add_calls_raw_payload.sql
├── utils/                   # Utilities
│   ├── callHelpers.js
│   ├── logger.js
│   └── validators.js
├── scripts/                 # Utilities & testing
│   ├── generateTestEvents.js
│   ├── processEvents.js
│   ├── testCallsAPI.js
│   └── testHardening.js
├── documentation/           # User guides
├── .env                     # Configuration (not in Git)
├── .env.example             # Template
├── DB_Schema.sql            # Complete database schema
├── db.js                    # Database connection
├── index.js                 # Application entry point
└── package.json             # Dependencies
```

---

## 🛠️ Configuration

### Environment Variables

| Variable                        | Required | Description                                                         |
| ------------------------------- | -------- | ------------------------------------------------------------------- |
| `PORT`                          | No       | Server port (default: 4000)                                         |
| `NODE_ENV`                      | No       | sandbox or production (default: sandbox)                            |
| `DB_HOST`                       | Yes      | PostgreSQL hostname                                                 |
| `DB_PORT`                       | Yes      | PostgreSQL port (default: 5432)                                     |
| `DB_USER`                       | Yes      | PostgreSQL username                                                 |
| `DB_PASSWORD`                   | Yes      | PostgreSQL password                                                 |
| `DB_NAME`                       | Yes      | Database name                                                       |
| `DIALPAD_SANDBOX_CLIENT_ID`     | Yes      | Dialpad sandbox OAuth client ID                                     |
| `DIALPAD_SANDBOX_CLIENT_SECRET` | Yes      | Dialpad sandbox OAuth secret                                        |
| `DIALPAD_PROD_CLIENT_ID`        | If prod  | Dialpad production client ID                                        |
| `DIALPAD_PROD_CLIENT_SECRET`    | If prod  | Dialpad production secret                                           |
| `DIALPAD_SANDBOX_REDIRECT_URI`  | Yes      | OAuth callback URL (sandbox)                                        |
| `DIALPAD_PROD_REDIRECT_URI`     | If prod  | OAuth callback URL (prod)                                           |
| `DIALPAD_WEBHOOK_SECRET`        | Yes      | Webhook signature secret                                            |
| `INTERNAL_API_SECRET`           | Yes      | Bearer token for admin endpoints                                    |
| `DIALPAD_SCOPES`                | No       | OAuth scopes (default: calls:list recordings_export offline_access) |

### Database Setup

```bash
# Create database
createdb CTI

# Load schema
psql -d CTI -f DB_Schema.sql

# Verify tables
psql -d CTI -c "\dt"
```

---

## 🔄 Typical Workflow

### 1. User Authorizes

```bash
# Backend redirects user to authorize endpoint
GET /authorize?app_id=550e8400-e29b-41d4-a716-446655440000
  ↓
  # User logs into Dialpad & approves scopes
  ↓
  # Dialpad redirects back with auth code
  ↓
# CTI Server exchanges code for tokens
# Tokens stored in dialpad_connections table
```

### 2. Dialpad Sends Webhook

```
Incoming Call (Dialpad)
  ↓
POST /webhooks/dialpad (with HMAC signature)
  ↓
CTI Server validates signature & queues in webhook_events
  ↓
Event Processor (runs every 5 seconds)
  ├─→ Fetches unprocessed events
  ├─→ Inserts into calls table
  └─→ Pushes to WebSocket subscribers
```

### 3. Your Backend Uses CTI

```javascript
// Option A: WebSocket (real-time)
const ws = new WebSocket("wss://cti-server.com/ws?api_key=...");
ws.on("message", (event) => {
  // Handle call.ring, call.started, call.ended, etc.
});

// Option B: REST API (on-demand)
const calls = await fetch("/api/calls/active", {
  headers: { "x-api-key": apiKey },
});

// Option C: Hybrid (WebSocket + fallback polling)
subscribeWebSocket();
setInterval(verifyState, 30000);
```

---

## 📞 Support & Troubleshooting

### Common Issues

**"Cannot connect to database"**

- Verify PostgreSQL is running: `psql --version`
- Check `.env` variables match your setup
- Test connection: `psql -h localhost -U postgres -d CTI`

**"API key authentication failing (401)"**

- Generate new key: `POST /internal/apps/{id}/api-key` (with Bearer token)
- Verify header: `x-app-api-key: raw_...`
- Check app exists: `SELECT * FROM apps;`

**"Webhook events not processing"**

- Verify HMAC signature is correct (check logs)
- Check `event_type` is one of: `call.ring`, `call.started`, `call.ended`, etc.
- Verify event processor is running (check logs every 5 seconds)

For more troubleshooting, see [CTI_SERVER_OWNER_GUIDE.md](documentation/CTI_SERVER_OWNER_GUIDE.md#troubleshooting--support).

---

## 📚 Learning Path

1. **Read** [CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md) - Understand architecture
2. **Review** [CTI_SERVER_API.md](CTI_SERVER_API.md) - API reference
3. **Test Locally** - Follow [LOCAL_TESTING_GUIDE.md](documentation/LOCAL_TESTING_GUIDE.md)
4. **Implement** - Use [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md) for backend integration
5. **Deploy** - Reference [CTI_SERVER_OWNER_GUIDE.md](documentation/CTI_SERVER_OWNER_GUIDE.md)

---

## 🔒 Security Checklist

Before production:

- [ ] Change all `.env` secrets (use secrets manager)
- [ ] Enable HTTPS on all endpoints
- [ ] Configure database encryption at rest
- [ ] Set up automated backups (30+ day retention)
- [ ] Enable audit logging to centralized service
- [ ] Configure firewall rules (restrict inbound IPs)
- [ ] Test OAuth flow with real Dialpad account
- [ ] Verify webhook signature validation
- [ ] Set up monitoring & alerts
- [ ] Document recovery procedures

---

## 📦 Dependencies

- **Express.js** - HTTP server framework
- **PostgreSQL** - Relational database
- **bcrypt** - Password hashing
- **axios** - HTTP client (for Dialpad API)
- **ws** - WebSocket support
- **dotenv** - Environment variable management

All in `package.json` - install with `npm install`

---

## 📄 License

[Add your license here]

---

## 👥 Contributing

1. Create a feature branch
2. Make your changes
3. Add tests
4. Submit pull request

---

## 📞 Contact & Support

**Documentation Questions:**

- See [CTI_SERVER_OWNER_GUIDE.md](documentation/CTI_SERVER_OWNER_GUIDE.md#troubleshooting--support)

**API Issues:**

- Check [CTI_SERVER_API.md](CTI_SERVER_API.md) for endpoint reference
- Review error responses and status codes

**Integration Help:**

- See [PRODUCTION_WORKFLOW.md](PRODUCTION_WORKFLOW.md) for backend patterns
- Reference [LOCAL_TESTING_GUIDE.md](documentation/LOCAL_TESTING_GUIDE.md) for testing

**Dialpad-Specific Questions:**

- [Dialpad API Documentation](https://docs.dialpad.com/)
- Dialpad Support Portal

---

## 🎯 What's Next?

- ✅ Review [CTI_SERVER_USAGE.md](CTI_SERVER_USAGE.md) for your use case
- ✅ Set up local testing with [LOCAL_TESTING_GUIDE.md](documentation/LOCAL_TESTING_GUIDE.md)
- ✅ Configure Dialpad OAuth credentials
- ✅ Implement webhook endpoint in your backend
- ✅ Deploy to staging for testing
- ✅ Configure monitoring & alerts
- ✅ Deploy to production

---

**Version:** 1.0.0  
**Last Updated:** January 30, 2026  
**Status:** Production Ready ✅
