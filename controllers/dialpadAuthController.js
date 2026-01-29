import axios from "axios";
import crypto from "node:crypto";
import pool from "../db.js";
import { logger } from "../utils/logger.js";
import { isValidUUID } from "../utils/validators.js";

// Configure Dialpad endpoints per environment
const BASE_URLS = {
  sandbox:
    process.env.DIALPAD_SANDBOX_BASE_URL || "https://sandbox.dialpad.com",
  production: process.env.DIALPAD_PROD_BASE_URL || "https://dialpad.com",
};

const REDIRECT_URIS = {
  sandbox:
    process.env.DIALPAD_SANDBOX_REDIRECT_URI ||
    "https://localhost:4000/auth/dialpad/callback",
  production:
    process.env.DIALPAD_PROD_REDIRECT_URI ||
    "https://your-domain.com/auth/dialpad/callback",
};

// Use sandbox or production credentials based on NODE_ENV
const ENV = process.env.NODE_ENV === "production" ? "PROD" : "SANDBOX";
const CLIENT_ID = process.env[`DIALPAD_${ENV}_CLIENT_ID`];
const CLIENT_SECRET = process.env[`DIALPAD_${ENV}_CLIENT_SECRET`];
const SCOPES =
  process.env.DIALPAD_SCOPES || "calls:list recordings_export offline_access";

function getEnvName() {
  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
}

function getBase() {
  return BASE_URLS[getEnvName()];
}

function getRedirectUri() {
  return REDIRECT_URIS[getEnvName()];
}

/**
 * Generate PKCE code verifier and challenge
 * @returns {Object} { codeVerifier, codeChallenge }
 */
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("hex");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return { codeVerifier, codeChallenge };
}

// build the authorization URL and redirect the user with PKCE
export async function connect(req, res) {
  try {
    const { app_id } = req.query;

    // Validate app_id format
    if (!app_id) {
      return res.status(400).json({ error: "Missing app_id in query" });
    }
    if (!isValidUUID(app_id)) {
      return res.status(400).json({ error: "Invalid app_id format" });
    }

    // Verify app exists and is active
    const appRes = await pool.query(
      "SELECT id, is_active, name FROM apps WHERE id = $1 LIMIT 1",
      [app_id],
    );
    if (appRes.rowCount === 0) {
      return res.status(404).json({ error: "App not found" });
    }
    if (!appRes.rows[0].is_active) {
      return res.status(403).json({ error: "App is disabled" });
    }

    // Generate PKCE challenge
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Create state with app_id and store PKCE verifier in session
    const state = Buffer.from(JSON.stringify({ app_id })).toString("base64");

    // Store PKCE verifier in session for callback verification
    if (!req.session) {
      req.session = {};
    }
    req.session.pkceVerifier = codeVerifier;
    req.session.oauthState = state;

    logger.info("OAuth authorization initiated", {
      app_id,
      app_name: appRes.rows[0].name,
      environment: getEnvName(),
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: getRedirectUri(),
      state,
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `${getBase()}/oauth2/authorize?${params.toString()}`;
    return res.redirect(authorizeUrl);
  } catch (err) {
    logger.error("OAuth connect error", { error: err.message });
    return res
      .status(500)
      .json({ error: "Failed to start Dialpad OAuth flow" });
  }
}

// handle the OAuth callback and exchange code for tokens with PKCE
export async function callback(req, res) {
  const { code, state } = req.query;

  // Validate callback parameters
  if (!code) {
    logger.warn("OAuth callback missing authorization code");
    return res.status(400).json({ error: "Missing authorization code" });
  }
  if (!state) {
    logger.warn("OAuth callback missing state parameter");
    return res.status(400).json({ error: "Missing state parameter" });
  }

  // Verify state matches session
  if (req.session?.oauthState !== state) {
    logger.warn("OAuth callback state mismatch - possible CSRF attack", {
      expected: req.session?.oauthState,
      received: state,
    });
    return res
      .status(400)
      .json({ error: "Invalid state parameter - CSRF detected" });
  }

  let parsedState;
  try {
    parsedState = JSON.parse(Buffer.from(String(state), "base64").toString());
  } catch (err) {
    logger.error("OAuth state parsing failed", { error: err.message });
    return res.status(400).json({ error: "Invalid state format" });
  }

  const { app_id } = parsedState;
  if (!app_id) {
    logger.warn("OAuth state missing app_id");
    return res.status(400).json({ error: "Missing app_id in state" });
  }

  // Verify the app exists and is active
  try {
    const appRes = await pool.query(
      "SELECT id, is_active, name FROM apps WHERE id = $1 LIMIT 1",
      [app_id],
    );
    if (appRes.rowCount === 0) {
      logger.warn("OAuth callback for unknown app", { app_id });
      return res.status(404).json({ error: "App not found" });
    }
    if (!appRes.rows[0].is_active) {
      logger.warn("OAuth callback for inactive app", { app_id });
      return res.status(403).json({ error: "App is not active" });
    }
  } catch (err) {
    logger.error("DB error checking app", { error: err.message });
    return res.status(500).json({ error: "Database error" });
  }

  // Exchange code for tokens
  try {
    const tokenUrl = `${getBase()}/oauth2/token`;
    const codeVerifier = req.session?.pkceVerifier;

    if (!codeVerifier) {
      logger.error("Missing PKCE verifier in session", { app_id });
      return res
        .status(400)
        .json({ error: "Invalid session state - PKCE verifier missing" });
    }

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    });

    const tokenResp = await axios.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });

    const data = tokenResp.data || {};
    const access_token = data.access_token;
    const refresh_token = data.refresh_token;
    const expires_in = data.expires_in || 0;
    const token_type = data.token_type || "bearer";
    const dialpad_org_id =
      data.organization_id || data.org_id || data.dialpad_org_id || null;

    // Validate token response
    if (!access_token) {
      logger.error("Token response missing access_token", { app_id, data });
      return res
        .status(500)
        .json({ error: "Invalid token response from Dialpad" });
    }

    if (!refresh_token) {
      logger.error(
        "Token response missing refresh_token (offline_access scope required)",
        { app_id, data },
      );
      return res.status(500).json({
        error:
          "Missing refresh token - ensure offline_access scope is approved",
      });
    }

    if (token_type !== "bearer") {
      logger.warn("Unexpected token type", { app_id, token_type });
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000);
    const environment = getEnvName();

    // Upsert into dialpad_connections
    try {
      const existing = await pool.query(
        "SELECT id FROM dialpad_connections WHERE app_id = $1 LIMIT 1",
        [app_id],
      );
      if (existing.rowCount > 0) {
        await pool.query(
          `UPDATE dialpad_connections SET
             dialpad_org_id = $1,
             access_token = $2,
             refresh_token = $3,
             token_expires_at = $4,
             environment = $5,
             updated_at = now()
           WHERE app_id = $6`,
          [
            dialpad_org_id,
            access_token,
            refresh_token,
            expiresAt.toISOString(),
            environment,
            app_id,
          ],
        );

        logger.info("OAuth token refreshed", {
          app_id,
          dialpad_org_id,
          environment,
          expires_in,
        });
      } else {
        await pool.query(
          `INSERT INTO dialpad_connections (app_id, dialpad_org_id, access_token, refresh_token, token_expires_at, environment)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            app_id,
            dialpad_org_id,
            access_token,
            refresh_token,
            expiresAt.toISOString(),
            environment,
          ],
        );

        logger.info("OAuth token exchanged successfully", {
          app_id,
          dialpad_org_id,
          environment,
          expires_in,
        });
      }

      // Clear session PKCE data
      if (req.session) {
        delete req.session.pkceVerifier;
        delete req.session.oauthState;
      }
    } catch (err) {
      logger.error("DB error saving tokens", { error: err.message, app_id });
      return res.status(500).json({ error: "Failed to persist tokens" });
    }

    return res.json({ message: "Dialpad connected", app_id, environment });
  } catch (err) {
    if (err.response) {
      logger.error("Token exchange failed", {
        app_id,
        status: err.response.status,
        data: err.response.data,
      });
      return res
        .status(502)
        .json({ error: "Token exchange failed", details: err.response.data });
    }
    logger.error("Token exchange error", { error: err.message, app_id });
    return res.status(500).json({ error: "Token exchange error" });
  }
}

// Disconnect app and revoke Dialpad tokens
export async function disconnect(req, res) {
  const { app_id } = req.params;

  // Validate app_id
  if (!app_id || !isValidUUID(app_id)) {
    return res.status(400).json({ error: "Invalid app_id format" });
  }

  try {
    // Get connection details
    const connRes = await pool.query(
      "SELECT access_token, dialpad_org_id FROM dialpad_connections WHERE app_id = $1",
      [app_id],
    );

    if (connRes.rowCount === 0) {
      logger.warn("Disconnect attempt for non-existent connection", { app_id });
      return res.status(404).json({ error: "App not connected to Dialpad" });
    }

    const { access_token, dialpad_org_id } = connRes.rows[0];
    const env = getEnvName();
    const deauthUrl = `${BASE_URLS[env]}/oauth2/deauthorize`;

    try {
      // Call Dialpad to revoke tokens
      await axios.post(
        deauthUrl,
        {},
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          timeout: 10000,
        },
      );
      logger.info("Dialpad tokens revoked successfully", {
        app_id,
        dialpad_org_id,
      });
    } catch (err) {
      logger.error("Failed to revoke Dialpad tokens", {
        app_id,
        error: err.message,
        status: err.response?.status,
      });
      // Continue deletion even if revocation fails
    }

    // Delete connection from our database
    await pool.query("DELETE FROM dialpad_connections WHERE app_id = $1", [
      app_id,
    ]);

    logger.info("App disconnected from Dialpad", {
      app_id,
      dialpad_org_id,
      environment: env,
    });

    return res.json({
      message: "App successfully disconnected from Dialpad",
      app_id,
    });
  } catch (err) {
    logger.error("Disconnect error", { error: err.message, app_id });
    return res.status(500).json({ error: "Failed to disconnect app" });
  }
}

// Refresh access/refresh tokens for a given app_id using stored refresh_token.
export async function refreshTokensForApp(app_id) {
  if (!app_id) throw new Error("Missing app_id");

  const env = getEnvName();
  const tokenUrl = `${BASE_URLS[env]}/oauth2/token`;

  // Load existing connection
  const connRes = await pool.query(
    "SELECT refresh_token FROM dialpad_connections WHERE app_id = $1 LIMIT 1",
    [app_id],
  );
  if (connRes.rowCount === 0) throw new Error("No connection for app");
  const currentRefresh = connRes.rows[0].refresh_token;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentRefresh,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const tokenResp = await axios.post(tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });

  const data = tokenResp.data || {};
  const access_token = data.access_token;
  const new_refresh_token = data.refresh_token;
  const expires_in = data.expires_in || 0;
  const dialpad_org_id =
    data.organization_id || data.org_id || data.dialpad_org_id || null;

  // Validate required fields
  if (!access_token) {
    throw new Error("Refresh response missing access_token");
  }

  // Dialpad ALWAYS returns a new refresh token
  if (!new_refresh_token) {
    logger.error(
      "Dialpad refresh did not return new refresh_token - API may have changed",
      { app_id },
    );
    throw new Error(
      "Missing refresh_token in Dialpad response - offline_access scope may not be approved",
    );
  }

  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await pool.query(
    `UPDATE dialpad_connections SET
       dialpad_org_id = $1,
       access_token = $2,
       refresh_token = $3,
       token_expires_at = $4,
       updated_at = now()
     WHERE app_id = $5`,
    [
      dialpad_org_id,
      access_token,
      new_refresh_token,
      expiresAt.toISOString(),
      app_id,
    ],
  );

  logger.info("Token refreshed successfully", {
    app_id,
    expires_in,
    dialpad_org_id,
  });

  return { access_token, refresh_token: new_refresh_token, expiresAt };
}

// Helper to fetch a valid access token, refreshing if expired or near expiry.
export async function getValidAccessToken(
  app_id,
  opts = { refreshWindowSeconds: 60 },
) {
  if (!app_id) throw new Error("Missing app_id");

  const r = await pool.query(
    "SELECT access_token, refresh_token, token_expires_at FROM dialpad_connections WHERE app_id = $1 LIMIT 1",
    [app_id],
  );
  if (r.rowCount === 0) throw new Error("No connection for app");

  const row = r.rows[0];
  const expiresAt = row.token_expires_at
    ? new Date(row.token_expires_at)
    : null;
  const now = Date.now();
  if (
    expiresAt &&
    expiresAt.getTime() - now > (opts.refreshWindowSeconds || 60) * 1000
  ) {
    return row.access_token;
  }

  // Otherwise refresh
  const refreshed = await refreshTokensForApp(app_id);
  return refreshed.access_token;
}
