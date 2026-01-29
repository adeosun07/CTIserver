import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import rateLimit from "express-rate-limit";
import session from "express-session";

import dialpadAuthRouter from "./routes/dialpadAuth.js";
import webhooksRouter from "./routes/webhooks.js";
import callsRouter from "./routes/calls.js";
import internalRouter from "./routes/internal.js";

// Import event processing
import { startEventProcessor } from "./services/dialpadEventProcessor.js";
import { registerCallHandlers } from "./services/callEventHandlers.js";

// Import WebSocket manager
import { initializeWebSocketServer } from "./services/websocketManager.js";

// Import utilities
import { logger } from "./utils/logger.js";
import { testConnection } from "./db.js";

// =============================================================================
// ENVIRONMENT VALIDATION - Fail fast if critical config is missing
// =============================================================================
const requiredEnvs = [
  "DIALPAD_WEBHOOK_SECRET",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "REDIRECT_URI",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "INTERNAL_API_SECRET",
];

const missing = requiredEnvs.filter((e) => !process.env[e]);
if (missing.length > 0) {
  console.error("\n❌ FATAL: Missing required environment variables:", missing);
  console.error("\nPlease configure these in your .env file and try again.\n");
  process.exit(1);
}

logger.info("✓ All required environment variables configured");

const app = express();
const PORT = process.env.PORT || 4000;

// Create HTTP server for WebSocket support
const httpServer = http.createServer(app);

// =============================================================================
// MIDDLEWARE
// =============================================================================
app.use(cors());

// Session middleware for PKCE storage during OAuth flow
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      httpOnly: true, // Prevent XSS access
      sameSite: "lax", // CSRF protection
      maxAge: 15 * 60 * 1000, // 15 minutes
    },
  }),
);
// Capture raw body for webhook signature verification while still parsing JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.debug(`HTTP ${req.method} ${req.path}`, {
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
    });
  });
  next();
});

// Rate limiting
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute
  message: "Too many webhook requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  message: "Too many API requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const internalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute (stricter for internal)
  message: "Too many internal API requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for OAuth endpoints (stricter - prevent OAuth flow attacks)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 auth attempts per 15 minutes
  skipSuccessfulRequests: true, // Only count failures
  message: "Too many OAuth attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// =============================================================================
// HTTPS ENFORCEMENT IN PRODUCTION
// =============================================================================
if (process.env.NODE_ENV === "production") {
  // Redirect HTTP to HTTPS
  app.use((req, res, next) => {
    if (!req.secure && req.get("x-forwarded-proto") !== "https") {
      return res.redirect(`https://${req.get("host")}${req.url}`);
    }
    // Add HSTS header
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    next();
  });

  // Validate REDIRECT_URI uses HTTPS in production
  const redirectUri = process.env.REDIRECT_URI;
  if (!redirectUri || !redirectUri.startsWith("https://")) {
    logger.error("FATAL: REDIRECT_URI must use HTTPS in production");
    console.error(
      "❌ FATAL: REDIRECT_URI must use HTTPS in production\n",
      "Current value:",
      redirectUri,
    );
    process.exit(1);
  }
}

// =============================================================================
// HEALTH & STATUS ENDPOINTS
// =============================================================================
app.get("/", (req, res) => {
  res.json({ message: "CTI Server is running" });
});

// Health check endpoint - used by load balancers and monitoring
app.get("/health", async (req, res) => {
  try {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "sandbox",
      port: PORT,
    };

    res.status(200).json(health);
  } catch (err) {
    logger.error("Health check error", { err: err.message });
    res.status(503).json({ status: "unhealthy", error: err.message });
  }
});

// Metrics endpoint - WebSocket and memory stats
app.get("/metrics", (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    timestamp: new Date().toISOString(),
    memory: {
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memUsage.external / 1024 / 1024),
    },
    uptime_seconds: process.uptime(),
  });
});

// Dialpad OAuth routes (protected by auth rate limiter)
app.use("/auth/dialpad", authLimiter, dialpadAuthRouter);

// Webhooks route (rate limited)
app.use("/webhooks", webhookLimiter, webhooksRouter);

// Calls API (read-only, API key authenticated, rate limited)
app.use("/api/calls", apiLimiter, callsRouter);

// Internal routes (protected by auth + rate limited)
app.use("/internal", internalLimiter, internalRouter);

// =============================================================================
// INITIALIZE SERVICES
// =============================================================================

// Test database connection before proceeding
try {
  await testConnection();
  logger.info("✓ Database connection verified");
} catch (err) {
  logger.error("❌ Database connection failed", { error: err.message });
  process.exit(1);
}

// Initialize WebSocket server
const wsServer = initializeWebSocketServer(httpServer);
logger.info("✓ WebSocket server initialized on /ws (upgrade endpoint)");

// Initialize event processing
registerCallHandlers(); // Register all call event handlers
logger.info("✓ Call event handlers registered");

// Start the event processor with 5-second polling interval
const stopProcessor = startEventProcessor({
  intervalMs: 5000, // Poll every 5 seconds
  batchSize: 50, // Process up to 50 events per batch
});
logger.info("✓ Webhook event processor started (polling every 5s)");

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, initiating graceful shutdown...");
  stopProcessor();
  wsServer.heartbeatInterval && clearInterval(wsServer.heartbeatInterval);
  httpServer.close(() => {
    logger.info("✓ Server closed successfully");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, initiating graceful shutdown...");
  stopProcessor();
  wsServer.heartbeatInterval && clearInterval(wsServer.heartbeatInterval);
  httpServer.close(() => {
    logger.info("✓ Server closed successfully");
    process.exit(0);
  });
});

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise });
  process.exit(1);
});

// =============================================================================
// START SERVER
// =============================================================================
httpServer.listen(PORT, () => {
  logger.info(`✓ CTI Server started successfully`, {
    port: PORT,
    env: process.env.NODE_ENV || "sandbox",
    ws_url: `ws://localhost:${PORT}/ws`,
    health_url: `http://localhost:${PORT}/health`,
  });
});
