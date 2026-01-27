import crypto from "crypto";
import pool from "../db.js";

// Header names and secret env var
const SIGNATURE_HEADER =
  process.env.DIALPAD_WEBHOOK_SIGNATURE_HEADER || "x-dialpad-signature";
const APP_KEY_HEADER = process.env.DIALPAD_APP_KEY_HEADER || "x-app-api-key";
const WEBHOOK_SECRET = process.env.DIALPAD_WEBHOOK_SECRET;

/**
 * Verify webhook signature using raw body
 */
function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET || !rawBody || !signature) return false;

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
    console.error("Signature verification error:", err);
    return false;
  }
}

export async function handleDialpadWebhook(req, res) {
  try {
    const signature =
      req.headers[SIGNATURE_HEADER] || req.headers["x-signature"];
    const rawBody = req.rawBody;

    /**
     * Enforce signature verification if configured
     */
    if (WEBHOOK_SECRET) {
      if (!verifySignature(rawBody, signature)) {
        console.warn("Invalid webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const payload = req.body || {};

    /**
     * Extract Dialpad org id from payload (multiple fallbacks)
     */
    const dialpad_org_id =
      payload.organization_id ||
      payload.org_id ||
      payload.company?.id ||
      null;

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
          console.warn(
            "Webhook received for unknown dialpad_org_id:",
            dialpad_org_id,
          );
        }
      } catch (err) {
        console.error("DB error resolving app by dialpad_org_id:", err);
      }
    }


    if (!app_id) {
      const appApiKey = req.headers[APP_KEY_HEADER];
      if (appApiKey) {
        try {
          const r = await pool.query(
            "SELECT id FROM apps WHERE api_key = $1 LIMIT 1",
            [appApiKey],
          );
          if (r.rowCount > 0) app_id = r.rows[0].id;
          else console.warn("Unknown app api key on webhook");
        } catch (err) {
          console.error("DB error resolving app by api key:", err);
        }
      }
    }

    const eventType =
      payload.event_type || payload.type || req.headers["x-event-type"] || null;

    const dialpadEventId =
      payload.id || payload.event_id || payload.uuid || null;
    try {
      await pool.query(
        `INSERT INTO webhook_events (app_id, event_type, dialpad_event_id, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (dialpad_event_id) DO NOTHING`,
        [app_id, eventType, dialpadEventId, payload],
      );
    } catch (err) {
      console.error("Failed to persist webhook event:", err);
      return res.status(500).json({ error: "Webhook persistence failed" });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler crashed:", err);
    return res.status(500).json({ error: "Webhook handler error" });
  }
}