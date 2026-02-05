/**
 * Webhook Management Controller
 * Provides endpoints for managing Dialpad webhooks
 */
import axios from "axios";
import {
  getWebhooksForApp,
  getWebhookById,
  deleteWebhook,
  storeWebhookMetadata,
} from "../services/webhookService.js";
import { getValidAccessToken } from "./dialpadAuthController.js";
import { logger } from "../utils/logger.js";
import pool from "../db.js";

/**
 * POST /internal/webhooks/create - Create a new webhook in Dialpad
 * Automatically creates webhook for an app using stored OAuth token or DIALPAD_API_KEY
 *
 * Query params: app_id (required)
 * Body: { webhook_url?, webhook_secret? }
 *
 * If webhook_url or webhook_secret not provided, uses defaults:
 * - webhook_url: https://{CTI_HOST}/webhooks/dialpad
 * - webhook_secret: DIALPAD_WEBHOOK_SECRET from .env
 */
export async function createWebhookInDialpad(req, res) {
  try {
    const { app_id } = req.query;
    const { webhook_url, webhook_secret } = req.body || {};

    if (!app_id) {
      return res.status(400).json({ error: "app_id query parameter required" });
    }

    let access_token = process.env.DIALPAD_API_KEY;
    let environment =
      process.env.NODE_ENV === "production" ? "production" : "sandbox";

    if (!access_token) {
      // Get the app's Dialpad connection (OAuth tokens)
      const connRes = await pool.query(
        `SELECT dialpad_org_id, access_token, environment 
         FROM dialpad_connections 
         WHERE app_id = $1 LIMIT 1`,
        [app_id],
      );

      if (connRes.rowCount === 0) {
        logger.warn("No Dialpad connection for app", { app_id });
        return res.status(404).json({
          error:
            "No Dialpad connection found and DIALPAD_API_KEY is not configured",
        });
      }

      environment = connRes.rows[0].environment || environment;
      access_token = await getValidAccessToken(app_id);
    }

    // Use provided values or defaults
    const finalWebhookUrl =
      webhook_url ||
      `${process.env.DIALPAD_PROD_REDIRECT_URI || "https://localhost:4000"}/webhooks/dialpad`;
    const finalWebhookSecret =
      webhook_secret || process.env.DIALPAD_WEBHOOK_SECRET;

    if (!finalWebhookSecret) {
      return res.status(500).json({
        error: "DIALPAD_WEBHOOK_SECRET not configured in server",
      });
    }

    // Determine Dialpad API base URL
    const baseUrl =
      environment === "production"
        ? process.env.DIALPAD_PROD_BASE_URL || "https://dialpad.com"
        : process.env.DIALPAD_SANDBOX_BASE_URL || "https://sandbox.dialpad.com";

    try {
      // Create webhook in Dialpad
      const webhookRes = await axios.post(
        `${baseUrl}/api/v2/webhooks`,
        {
          hook_url: finalWebhookUrl,
          secret: finalWebhookSecret,
        },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      const webhookData = webhookRes.data || {};
      const webhookId = webhookData.id;

      if (!webhookId) {
        logger.error("Dialpad webhook creation response missing ID", {
          app_id,
          response: webhookData,
        });
        return res.status(502).json({
          error: "Dialpad webhook created but no ID in response",
        });
      }

      // Store webhook metadata in our database
      await storeWebhookMetadata(app_id, {
        webhook_id: webhookId,
        hook_url: finalWebhookUrl,
        secret: finalWebhookSecret,
        ...webhookData,
      });

      logger.info("Webhook created successfully in Dialpad", {
        app_id,
        webhook_id: webhookId,
        environment,
      });

      return res.status(201).json({
        success: true,
        message: "Webhook created successfully",
        webhook_id: webhookId,
        hook_url: finalWebhookUrl,
        next_step: "Create subscriptions for call/SMS events using webhook_id",
      });
    } catch (dialpadErr) {
      logger.error("Failed to create webhook in Dialpad", {
        app_id,
        status: dialpadErr.response?.status,
        error: dialpadErr.response?.data || dialpadErr.message,
      });

      return res.status(502).json({
        error: "Failed to create webhook in Dialpad",
        details: dialpadErr.response?.data,
      });
    }
  } catch (err) {
    logger.error("Webhook creation handler error", { error: err.message });
    return res.status(500).json({ error: "Webhook creation failed" });
  }
}

export async function listWebhooks(req, res) {
  try {
    const { app_id } = req.query;

    if (!app_id) {
      return res.status(400).json({ error: "app_id query parameter required" });
    }

    const webhooks = await getWebhooksForApp(app_id);

    logger.info("Webhooks listed", { app_id, count: webhooks.length });
    return res.status(200).json({
      success: true,
      count: webhooks.length,
      webhooks,
    });
  } catch (err) {
    logger.error("Failed to list webhooks", { error: err.message });
    return res.status(500).json({ error: "Failed to list webhooks" });
  }
}

/**
 * GET /internal/webhooks/:webhook_id - Get webhook details
 */
export async function getWebhook(req, res) {
  try {
    const { webhook_id } = req.params;

    if (!webhook_id) {
      return res.status(400).json({ error: "webhook_id required" });
    }

    const webhook = await getWebhookById(parseInt(webhook_id, 10));

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    logger.info("Webhook retrieved", { webhook_id });
    return res.status(200).json({
      success: true,
      webhook,
    });
  } catch (err) {
    logger.error("Failed to retrieve webhook", { error: err.message });
    return res.status(500).json({ error: "Failed to retrieve webhook" });
  }
}

/**
 * DELETE /internal/webhooks/:webhook_id - Delete webhook metadata
 * Note: This only removes the local record. You should also delete the webhook
 * on Dialpad's end via their API.
 */
export async function removeWebhook(req, res) {
  try {
    const { webhook_id } = req.params;

    if (!webhook_id) {
      return res.status(400).json({ error: "webhook_id required" });
    }

    const deleted = await deleteWebhook(parseInt(webhook_id, 10));

    if (!deleted) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    logger.info("Webhook metadata deleted", { webhook_id });
    return res.status(200).json({
      success: true,
      message:
        "Webhook metadata removed. Remember to delete the webhook in Dialpad as well.",
    });
  } catch (err) {
    logger.error("Failed to delete webhook", { error: err.message });
    return res.status(500).json({ error: "Failed to delete webhook" });
  }
}
