import crypto from "node:crypto";
import pool from "../db.js";
import { logger } from "../utils/logger.js";

// Header names and secret env var
const SIGNATURE_HEADER =
  process.env.DIALPAD_WEBHOOK_SIGNATURE_HEADER || "x-dialpad-signature";
const APP_KEY_HEADER = process.env.DIALPAD_APP_KEY_HEADER || "x-app-api-key";
const WEBHOOK_SECRET = process.env.DIALPAD_WEBHOOK_SECRET;

/**
 * Verify webhook signature using raw body with HMAC-SHA256
 * Signature verification is MANDATORY - all webhooks must be verified
 */
function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET || !rawBody || !signature) {
    logger.warn(
      "Webhook signature verification failed - missing required fields",
      {
        has_secret: !!WEBHOOK_SECRET,
        has_body: !!rawBody,
        has_signature: !!signature,
      },
    );
    return false;
  }

  try {
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(String(signature)),
    );
  } catch (err) {
    logger.error("Signature verification error", { error: err.message });
    return false;
  }
}

export async function handleDialpadWebhook(req, res) {
  try {
    const signature =
      req.headers[SIGNATURE_HEADER] || req.headers["x-signature"];
    const rawBody = req.rawBody;

    /**
     * ENFORCE signature verification - mandatory for security
     * Prevents unauthorized webhook injection
     */
    if (!verifySignature(rawBody, signature)) {
      logger.warn("Webhook rejected - invalid signature", {
        ip: req.ip,
        signature_header: SIGNATURE_HEADER,
      });
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const payload = req.body || {};

    /**
     * Extract Dialpad org id from payload (multiple fallbacks)
     */
    const dialpad_org_id =
      payload.organization_id || payload.org_id || payload.company?.id || null;

    /**
     * Resolve app_id via dialpad_connections
     */
    let app_id = null;

    if (dialpad_org_id) {
      try {
        const r = await pool.query(
          `SELECT app_id
           FROM dialpad_connections
           WHERE dialpad_org_id = $1
           LIMIT 1`,
          [dialpad_org_id],
        );
        if (r.rowCount > 0) {
          app_id = r.rows[0].app_id;
        } else {
          logger.warn("Webhook received for unknown dialpad_org_id", {
            dialpad_org_id,
          });
        }
      } catch (err) {
        logger.error("DB error resolving app by dialpad_org_id", {
          error: err.message,
          dialpad_org_id,
        });
      }
    }

    // Fallback: try to resolve app_id via API key header
    if (!app_id) {
      const appApiKey = req.headers[APP_KEY_HEADER];
      if (appApiKey) {
        try {
          const r = await pool.query(
            "SELECT id FROM apps WHERE api_key = $1 LIMIT 1",
            [appApiKey],
          );
          if (r.rowCount > 0) {
            app_id = r.rows[0].id;
          } else {
            logger.warn("Webhook rejected - unknown API key", {
              ip: req.ip,
            });
          }
        } catch (err) {
          logger.error("DB error resolving app by API key", {
            error: err.message,
          });
        }
      }
    }

    const eventType =
      payload.event_type || payload.type || req.headers["x-event-type"] || null;

    const dialpadEventId =
      payload.id || payload.event_id || payload.uuid || null;

    logger.info("Webhook received and verified", {
      app_id,
      dialpad_org_id,
      event_type: eventType,
      dialpad_event_id: dialpadEventId,
    });

    try {
      await pool.query(
        `INSERT INTO webhook_events (app_id, event_type, dialpad_event_id, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (dialpad_event_id) DO NOTHING`,
        [app_id, eventType, dialpadEventId, payload],
      );
    } catch (err) {
      logger.error("Failed to persist webhook event", {
        error: err.message,
        app_id,
        event_type: eventType,
      });
      return res.status(500).json({ error: "Webhook persistence failed" });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error("Webhook handler crashed", { error: err.message });
    return res.status(500).json({ error: "Webhook handler error" });
  }
}
