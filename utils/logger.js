/**
 * Structured Logging Utility
 *
 * Provides consistent, structured logging across the CTI server
 * with timestamps, log levels, and contextual information.
 *
 * Usage:
 *   import { log } from '../utils/logger.js';
 *   log('info', 'User created', { userId: '123', email: 'test@example.com' });
 *   log('error', 'Database error', { err, context: 'webhook_processing' });
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: "\x1b[31m", // Red
  warn: "\x1b[33m", // Yellow
  info: "\x1b[36m", // Cyan
  debug: "\x1b[35m", // Magenta
  reset: "\x1b[0m",
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || "info"];

export function log(level, message, metadata = {}) {
  // Check if we should log this level
  if (LOG_LEVELS[level] > currentLogLevel) {
    return;
  }

  const timestamp = new Date().toISOString();
  const color = COLORS[level] || "";
  const reset = COLORS.reset;

  // Build the log entry
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...metadata,
  };

  // Format for console output
  const consoleOutput = `${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}`;

  if (Object.keys(metadata).length > 0) {
    console.log(consoleOutput, JSON.stringify(metadata, null, 2));
  } else {
    console.log(consoleOutput);
  }

  // Also log as JSON for structured log aggregation (Datadog, CloudWatch, etc.)
  if (process.env.JSON_LOGS === "true") {
    console.log(JSON.stringify(logEntry));
  }
}

// Convenience functions
export const logger = {
  error: (msg, meta = {}) => log("error", msg, meta),
  warn: (msg, meta = {}) => log("warn", msg, meta),
  info: (msg, meta = {}) => log("info", msg, meta),
  debug: (msg, meta = {}) => log("debug", msg, meta),
};
