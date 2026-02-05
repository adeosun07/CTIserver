import crypto from "node:crypto";
import pool from "../db.js";
import { logger } from "../utils/logger.js";
import { validateApiKey } from "./apiKeyController.js";
import { storeWebhookMetadata } from "../services/webhookService.js";

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

/**
 * Verify Dialpad JWT signature (HS256)
 * JWT signature = base64url(HMAC_SHA256(secret, header.payload))
 */
function verifyJwtSignature(jwtToken) {
  if (!WEBHOOK_SECRET || !jwtToken) {
    return { valid: false, reason: "missing_secret_or_token" };
  }

  const parts = jwtToken.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "invalid_format" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(signingInput)
    .digest();

  let received;
  try {
    received = Buffer.from(signatureB64, "base64url");
  } catch {
    try {
      received = Buffer.from(signatureB64, "base64");
    } catch {
      return { valid: false, reason: "invalid_signature_encoding" };
    }
  }

  if (received.length !== expected.length) {
    return { valid: false, reason: "signature_length_mismatch" };
  }

  const match = crypto.timingSafeEqual(expected, received);
  return { valid: match, reason: match ? null : "signature_mismatch" };
}

export async function handleDialpadWebhook(req, res) {
  try {
    // Handle JWT payload from Dialpad
    let payload = {};
    const rawBody = req.rawBody;
    let isJWT = false;

    if (req.headers["content-type"] === "application/jwt") {
      isJWT = true;
      const jwtToken =
        typeof req.body === "string" ? req.body : req.rawBody.toString("utf8");

      const jwtCheck = verifyJwtSignature(jwtToken);
      if (!jwtCheck.valid) {
        logger.warn("JWT signature verification failed", {
          reason: jwtCheck.reason,
        });
        return res.status(401).json({ error: "Invalid JWT signature" });
      }

      try {
        // JWT is base64url encoded: header.payload.signature
        const parts = jwtToken.split(".");
        if (parts.length === 3) {
          // Decode the payload (middle part)
          const payloadBase64 = parts[1];
          const payloadJson = Buffer.from(payloadBase64, "base64url").toString(
            "utf8",
          );
          payload = JSON.parse(payloadJson);

          logger.info("JWT webhook received", {
            state: payload.state,
            call_id: payload.call_id,
            direction: payload.direction,
          });

          logger.info("JWT signature verified successfully");
        } else {
          logger.warn("Invalid JWT format - expected 3 parts", {
            parts: parts.length,
          });
          return res.status(400).json({ error: "Invalid JWT format" });
        }
      } catch (err) {
        logger.error("Failed to decode JWT", { error: err.message });
        return res.status(400).json({ error: "Invalid JWT format" });
      }
    } else {
      // Standard JSON payload
      payload = req.body || {};

      // For non-JWT, verify signature via header
      const signature =
        req.headers[SIGNATURE_HEADER] || req.headers["x-signature"];

      if (!verifySignature(rawBody, signature)) {
        logger.warn("Webhook rejected - invalid signature", {
          ip: req.ip,
          signature_header: SIGNATURE_HEADER,
        });
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    /**
     * Extract Dialpad org id from payload (multiple fallbacks)
     * JWT webhooks may have it in target.office_id or other locations
     */
    const dialpad_org_id =
      payload.organization_id ||
      payload.org_id ||
      payload.company?.id ||
      payload.target?.office_id ||
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
            `SELECT id, api_key, is_active
             FROM apps
             WHERE api_key IS NOT NULL AND is_active = true`,
          );

          for (const app of r.rows) {
            const isValid = await validateApiKey(appApiKey, app.api_key);
            if (isValid) {
              app_id = app.id;
              break;
            }
          }

          if (!app_id) {
            logger.warn("Webhook rejected - unknown API key", { ip: req.ip });
          }
        } catch (err) {
          logger.error("DB error resolving app by API key", {
            error: err.message,
          });
        }
      }
    }

    if (!app_id) {
      logger.warn("Webhook rejected - unable to resolve app", {
        ip: req.ip,
        dialpad_org_id,
      });
      return res.status(401).json({ error: "Unknown or unauthorized app" });
    }

    // Extract event type - JWT webhooks use "state", others use "event_type"
    const eventType =
      payload.state ||
      payload.event_type ||
      payload.type ||
      req.headers["x-event-type"] ||
      null;

    // Dialpad JWT webhooks use call_id as the unique identifier
    const dialpadEventId =
      payload.call_id || payload.id || payload.event_id || payload.uuid || null;

    logger.info("Webhook received and verified", {
      app_id,
      dialpad_org_id,
      event_type: eventType,
      dialpad_event_id: dialpadEventId,
    });

    try {
      // Store webhook metadata if present in payload
      try {
        await storeWebhookMetadata(app_id, payload);
      } catch (err) {
        logger.warn("Could not store webhook metadata", {
          error: err.message,
          webhook_id: payload.webhook_id,
        });
        // Don't fail the entire request if metadata storage fails
      }

      // Persist webhook event to processing queue
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
