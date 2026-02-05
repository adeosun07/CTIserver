/**
 * Dialpad Webhook Service
 * Handles registration, storage, and management of Dialpad webhooks
 */
import pool from "../db.js";
import { logger } from "../utils/logger.js";

/**
 * Store webhook metadata when received in a webhook event
 * Dialpad sends webhook_id in the webhook payload for tracking
 * @param {UUID} app_id - Application ID
 * @param {Object} payload - Webhook payload from Dialpad
 * @returns {Promise<Object>} Stored webhook metadata
 */
export async function storeWebhookMetadata(app_id, payload) {
  try {
    // Extract webhook metadata from payload
    // Dialpad includes this in webhook events
    const webhook_id = payload.webhook_id || payload.webhook?.id || null;
    const hook_url = payload.hook_url || payload.webhook?.hook_url || null;

    // Extract signature details
    const secret = payload.secret || payload.signature?.secret || null;
    const algo = payload.algo || payload.signature?.algo || null;
    const signature_type = payload.type || payload.signature?.type || null;

    // Only store if we have a webhook_id
    if (!webhook_id) {
      logger.debug(
        "No webhook_id in payload, skipping webhook metadata storage",
        {
          app_id,
        },
      );
      return null;
    }

    if (!hook_url) {
      logger.debug(
        "No hook_url in payload, skipping webhook metadata storage",
        { app_id, webhook_id },
      );
      return null;
    }

    // Use UPSERT to handle webhook updates (e.g., if secret changes)
    const result = await pool.query(
      `INSERT INTO dialpad_webhooks (app_id, webhook_id, hook_url, secret, algo, signature_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (webhook_id) DO UPDATE SET
         hook_url = $3,
         secret = $4,
         algo = $5,
         signature_type = $6,
         updated_at = now()
       RETURNING *`,
      [app_id, webhook_id, hook_url, secret, algo, signature_type],
    );

    logger.info("Webhook metadata stored", {
      app_id,
      webhook_id,
      hook_url,
      action:
        result.rows[0].created_at === result.rows[0].updated_at
          ? "created"
          : "updated",
    });

    return result.rows[0];
  } catch (err) {
    logger.error("Failed to store webhook metadata", {
      error: err.message,
      app_id,
      webhook_id: payload.webhook_id || null,
    });
    throw err;
  }
}

/**
 * Retrieve all webhooks for an app
 * @param {UUID} app_id - Application ID
 * @returns {Promise<Array>} List of webhooks for the app
 */
export async function getWebhooksForApp(app_id) {
  try {
    const result = await pool.query(
      `SELECT * FROM dialpad_webhooks 
       WHERE app_id = $1 
       ORDER BY created_at DESC`,
      [app_id],
    );
    return result.rows;
  } catch (err) {
    logger.error("Failed to retrieve webhooks", {
      error: err.message,
      app_id,
    });
    throw err;
  }
}

/**
 * Get webhook metadata by webhook_id
 * @param {Number} webhook_id - Dialpad webhook ID
 * @returns {Promise<Object>} Webhook metadata
 */
export async function getWebhookById(webhook_id) {
  try {
    const result = await pool.query(
      `SELECT * FROM dialpad_webhooks WHERE webhook_id = $1 LIMIT 1`,
      [webhook_id],
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error("Failed to retrieve webhook by ID", {
      error: err.message,
      webhook_id,
    });
    throw err;
  }
}

/**
 * Delete webhook metadata
 * @param {Number} webhook_id - Dialpad webhook ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteWebhook(webhook_id) {
  try {
    const result = await pool.query(
      `DELETE FROM dialpad_webhooks WHERE webhook_id = $1`,
      [webhook_id],
    );
    logger.info("Webhook metadata deleted", { webhook_id });
    return result.rowCount > 0;
  } catch (err) {
    logger.error("Failed to delete webhook", {
      error: err.message,
      webhook_id,
    });
    throw err;
  }
}
