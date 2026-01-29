/**
 * Internal API Key Management Controller
 *
 * INTERNAL-ONLY endpoints for API key generation, rotation, and revocation
 * Designed for sandbox testing but production-safe
 *
 * Production-Grade Security:
 * - API keys are hashed using bcrypt (cost 10) before database storage
 * - Raw keys prefixed with "raw_" for identification during development
 * - Only plaintext key returned once at generation - cannot be recovered
 * - Audit log tracks all key operations for compliance
 *
 * WARNING: These endpoints should be protected by additional authentication
 * in production (e.g., JWT, Basic Auth) and not exposed publicly
 */

import crypto from "node:crypto";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { logger } from "../utils/logger.js";
import { isValidUUID } from "../utils/validators.js";

const BCRYPT_COST = 10; // Standard cost factor for bcrypt

/**
 * Generate a cryptographically secure API key
 * Format: raw_<random_32_bytes_hex> (raw prefix indicates plaintext form)
 * @returns {string} - Generated API key with "raw_" prefix
 */
function generateApiKey() {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  return `raw_${randomBytes}`;
}

/**
 * Hash an API key using bcrypt
 * @param {string} key - Plain text API key
 * @returns {Promise<string>} - Hashed key for storage
 */
async function hashApiKey(key) {
  return bcrypt.hash(key, BCRYPT_COST);
}

/**
 * Verify an API key against its hash
 * @param {string} plainKey - Plain text API key to verify
 * @param {string} hashedKey - Hashed key from database
 * @returns {Promise<boolean>} - True if keys match
 */
async function verifyApiKey(plainKey, hashedKey) {
  return bcrypt.compare(plainKey, hashedKey);
}

/**
 * Extract first 8 and last 4 chars of key for audit logging
 * @param {string} key - Full API key
 * @returns {string} - Redacted key hint
 */
function getKeyHint(key) {
  if (!key || key.length < 12) return "***";
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
}

/**
 * POST /internal/apps/:app_id/api-key
 * Generate a new API key for an app
 * Rotates existing key if one is already present
 *
 * Returns the new key ONCE - never logged or stored in plaintext
 */
export async function generateApiKey_handler(req, res) {
  const { app_id } = req.params;

  // Validate UUID format
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  try {
    // Verify app exists and is active
    const appResult = await pool.query(
      `SELECT id, api_key, name, is_active FROM apps WHERE id = $1 LIMIT 1`,
      [app_id],
    );

    if (appResult.rowCount === 0) {
      logger.warn("API key generation failed - app not found", { app_id });
      return res.status(404).json({ error: "App not found" });
    }

    if (!appResult.rows[0].is_active) {
      logger.warn("API key generation failed - app inactive", { app_id });
      return res.status(403).json({ error: "App is not active" });
    }

    const app = appResult.rows[0];
    const oldKeyHash = app.api_key;
    const oldKeyHint = oldKeyHash ? getKeyHint(oldKeyHash) : null;

    // Generate new key (plaintext with raw_ prefix)
    const newKeyPlain = generateApiKey();

    // Hash for storage in database
    const newKeyHash = await hashApiKey(newKeyPlain);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update apps table with hashed key
      await client.query(
        `UPDATE apps SET 
           api_key = $1,
           api_key_rotated_at = now()
         WHERE id = $2`,
        [newKeyHash, app_id],
      );

      // Log the rotation in audit table
      const action = oldKeyHash ? "rotated" : "created";
      await client.query(
        `INSERT INTO api_key_audit_log (app_id, action, old_key_hint, new_key_hint)
         VALUES ($1, $2, $3, $4)`,
        [app_id, action, oldKeyHint, getKeyHint(newKeyPlain)],
      );

      await client.query("COMMIT");

      logger.info(`API key ${action} for app`, {
        app_id,
        app_name: app.name,
        action,
      });

      // Return the KEY ONCE - it cannot be recovered later (only hash is stored)
      return res.status(200).json({
        success: true,
        message: `API key ${action} successfully. Store this securely - it CANNOT be retrieved again.`,
        api_key: newKeyPlain,
        app_id,
        app_name: app.name,
        generated_at: new Date().toISOString(),
        warning:
          "This is the ONLY time this key will be displayed. Store it immediately in a secure location.",
        usage:
          "Include this key in the 'x-app-api-key' header when making API requests",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("API key generation failed", { app_id, error: err.message });
    return res.status(500).json({ error: "Failed to generate API key" });
  }
}

/**
 * POST /internal/apps/:app_id/api-key/revoke
 * Revoke the current API key for an app
 * Prevents further API access until a new key is generated
 */
export async function revokeApiKey_handler(req, res) {
  const { app_id } = req.params;

  // Validate UUID format
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  try {
    // Verify app exists
    const appResult = await pool.query(
      `SELECT id, api_key, name FROM apps WHERE id = $1 LIMIT 1`,
      [app_id],
    );

    if (appResult.rowCount === 0) {
      logger.warn("API key revocation failed - app not found", { app_id });
      return res.status(404).json({ error: "App not found" });
    }

    const app = appResult.rows[0];
    const oldKeyHint = app.api_key ? getKeyHint(app.api_key) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Set api_key to null (revoked)
      await client.query(`UPDATE apps SET api_key = NULL WHERE id = $1`, [
        app_id,
      ]);

      // Log the revocation
      await client.query(
        `INSERT INTO api_key_audit_log (app_id, action, old_key_hint)
         VALUES ($1, $2, $3)`,
        [app_id, "revoked", oldKeyHint],
      );

      await client.query("COMMIT");

      logger.info("API key revoked for app", {
        app_id,
        app_name: app.name,
      });

      return res.status(200).json({
        success: true,
        message:
          "API key revoked. App cannot authenticate until new key is generated.",
        app_id,
        app_name: app.name,
        revoked_at: new Date().toISOString(),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("API key revocation failed", { app_id, error: err.message });
    return res.status(500).json({ error: "Failed to revoke API key" });
  }
}

/**
 * GET /internal/apps/:app_id/api-key/status
 * Check if an app has an active API key (without revealing the key)
 * Useful for diagnostics
 */
export async function checkApiKeyStatus_handler(req, res) {
  const { app_id } = req.params;

  // Validate UUID format
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, api_key, name, api_key_rotated_at FROM apps WHERE id = $1 LIMIT 1`,
      [app_id],
    );

    if (result.rowCount === 0) {
      logger.warn("API key status check - app not found", { app_id });
      return res.status(404).json({ error: "App not found" });
    }

    const app = result.rows[0];
    const hasKey = !!app.api_key;

    logger.debug("API key status checked", {
      app_id,
      has_active_key: hasKey,
    });

    return res.status(200).json({
      success: true,
      app_id: app.id,
      app_name: app.name,
      has_active_key: hasKey,
      key_hint: hasKey ? getKeyHint(app.api_key) : null,
      last_rotated: app.api_key_rotated_at || "Never",
      action_needed: !hasKey ? "Generate a new API key" : null,
    });
  } catch (err) {
    logger.error("API key status check failed", { app_id, error: err.message });
    return res.status(500).json({ error: "Failed to check API key status" });
  }
}

/**
 * GET /internal/apps/:app_id/api-key/audit
 * Retrieve audit log for API key rotations/revocations
 */
export async function getKeyAuditLog_handler(req, res) {
  const { app_id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  // Validate UUID format
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  try {
    // Verify app exists
    const appResult = await pool.query(
      `SELECT id FROM apps WHERE id = $1 LIMIT 1`,
      [app_id],
    );

    if (appResult.rowCount === 0) {
      logger.warn("API key audit log - app not found", { app_id });
      return res.status(404).json({ error: "App not found" });
    }

    const [logResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, app_id, action, old_key_hint, new_key_hint, created_at
         FROM api_key_audit_log 
         WHERE app_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [app_id, parseInt(limit, 10), parseInt(offset, 10)],
      ),
      pool.query(`SELECT COUNT(*) FROM api_key_audit_log WHERE app_id = $1`, [
        app_id,
      ]),
    ]);

    logger.info("API key audit log retrieved", {
      app_id,
      count: logResult.rows.length,
      total: parseInt(countResult.rows[0].count, 10),
    });

    return res.status(200).json({
      success: true,
      app_id,
      audit_log: logResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (err) {
    logger.error("API key audit log retrieval failed", {
      app_id,
      error: err.message,
    });
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
}

/**
 * EXPORTED HELPER FUNCTIONS for use in other services
 * These should NOT be HTTP endpoints but are used internally
 */

/**
 * Verify an API key against stored hash
 * Used during request authentication
 * @param {string} plainKey - Plain text API key from request
 * @param {string} hashedKey - Hashed key from database
 * @returns {Promise<boolean>} - True if valid
 */
export async function validateApiKey(plainKey, hashedKey) {
  try {
    return await verifyApiKey(plainKey, hashedKey);
  } catch (err) {
    logger.error("API key validation error", { error: err.message });
    return false;
  }
}
