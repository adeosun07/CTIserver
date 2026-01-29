import pool from "../db.js";
import { validateApiKey } from "../controllers/apiKeyController.js";
import { logger } from "../utils/logger.js";

/**
 * API Key Authentication Middleware
 *
 * Validates the x-app-api-key header and resolves the app_id.
 * Ensures tenant isolation by rejecting invalid or inactive apps.
 *
 * SECURITY: API keys are stored hashed (bcrypt) in database.
 * This middleware verifies the plain key from headers against the hash.
 *
 * Usage:
 *   router.get('/calls', apiKeyAuth, callsController.list);
 *
 * Sets req.app_id for downstream handlers.
 */
export async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-app-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing x-app-api-key header",
    });
  }

  try {
    // Fetch all active apps with API keys
    // We need to check the hash against each one since we can't query by hash
    const result = await pool.query(
      `SELECT id, name, is_active, api_key 
       FROM apps 
       WHERE api_key IS NOT NULL AND is_active = true`,
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
      });
    }

    // Find the matching app by verifying the bcrypt hash
    let matchedApp = null;
    for (const app of result.rows) {
      const isValid = await validateApiKey(apiKey, app.api_key);
      if (isValid) {
        matchedApp = app;
        break;
      }
    }

    if (!matchedApp) {
      logger.warn("API key authentication failed - invalid key");
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
      });
    }

    // Attach app_id to request for downstream use
    req.app_id = matchedApp.id;
    req.app_name = matchedApp.name;

    logger.debug("API key authenticated successfully", {
      app_id: matchedApp.id,
      app_name: matchedApp.name,
    });

    next();
  } catch (err) {
    logger.error("API key authentication error", { error: err.message });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication failed",
    });
  }
}
