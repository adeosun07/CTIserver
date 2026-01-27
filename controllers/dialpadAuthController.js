import axios from "axios";
import pool from "../db.js";

// Configure Dialpad endpoints per environment
const BASE_URLS = {
  sandbox:
    process.env.DIALPAD_SANDBOX_BASE_URL || "https://sandbox.dialpad.com",
  production: process.env.DIALPAD_PROD_BASE_URL || "https://dialpad.com",
};

const CLIENT_ID = process.env.DIALPAD_CLIENT_ID;
const CLIENT_SECRET = process.env.DIALPAD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DIALPAD_REDIRECT_URI;
const SCOPES = process.env.DIALPAD_SCOPES || "";

function getEnvName() {
  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
}

function getBase() {
  return BASE_URLS[getEnvName()];
}

// build the authorization URL and redirect the user
export async function connect(req, res) {
  try {
    const { app_id } = req.query;
    if (!app_id)
      return res.status(400).json({ error: "Missing app_id in query" });

    const state = Buffer.from(JSON.stringify({ app_id })).toString("base64");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state,
      scope: SCOPES,
    });

    const authorizeUrl = `${getBase()}/oauth/authorize?${params.toString()}`;
    return res.redirect(authorizeUrl);
  } catch (err) {
    console.error("connect error:", err);
    return res
      .status(500)
      .json({ error: "Failed to start Dialpad OAuth flow" });
  }
}

// handle the OAuth callback and exchange code for tokens
export async function callback(req, res) {
  const { code, state } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });
  if (!state) return res.status(400).json({ error: "Missing state" });

  let parsedState;
  try {
    parsedState = JSON.parse(Buffer.from(String(state), "base64").toString());
  } catch (err) {
    console.error("Invalid state:", err);
    return res.status(400).json({ error: "Invalid state" });
  }

  const { app_id } = parsedState;
  if (!app_id)
    return res.status(400).json({ error: "Missing app_id in state" });

  // Verify the app exists and is active
  try {
    const appRes = await pool.query(
      "SELECT id, is_active FROM apps WHERE id = $1 LIMIT 1",
      [app_id],
    );
    if (appRes.rowCount === 0)
      return res.status(404).json({ error: "App not found" });
    if (!appRes.rows[0].is_active)
      return res.status(403).json({ error: "App is not active" });
  } catch (err) {
    console.error("DB error checking app:", err);
    return res.status(500).json({ error: "Database error" });
  }

  // Exchange code for tokens
  try {
    const tokenUrl = `${getBase()}/oauth/token`;
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const tokenResp = await axios.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });

    const data = tokenResp.data || {};
    const access_token = data.access_token;
    const refresh_token = data.refresh_token;
    const expires_in = data.expires_in || 0;
    const dialpad_org_id =
      data.organization_id || data.org_id || data.dialpad_org_id || null;

    if (!access_token || !refresh_token) {
      console.error("Token response missing tokens:", data);
      return res
        .status(500)
        .json({ error: "Invalid token response from Dialpad" });
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
      }
    } catch (err) {
      console.error("DB error saving tokens:", err);
      return res.status(500).json({ error: "Failed to persist tokens" });
    }

    return res.json({ message: "Dialpad connected", app_id, environment });
  } catch (err) {
    if (err.response) {
      console.error(
        "Token exchange failed:",
        err.response.status,
        err.response.data,
      );
      return res
        .status(502)
        .json({ error: "Token exchange failed", details: err.response.data });
    }
    console.error("Token exchange error:", err);
    return res.status(500).json({ error: "Token exchange error" });
  }
}

// Refresh access/refresh tokens for a given app_id using stored refresh_token.
export async function refreshTokensForApp(app_id) {
  if (!app_id) throw new Error("Missing app_id");

  const env = getEnvName();
  const tokenUrl = `${BASE_URLS[env]}/oauth/token`;

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
  const refresh_token = data.refresh_token || currentRefresh; // some providers rotate, some don't
  const expires_in = data.expires_in || 0;
  const dialpad_org_id =
    data.organization_id || data.org_id || data.dialpad_org_id || null;

  if (!access_token) throw new Error("Refresh response missing access_token");

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
      refresh_token,
      expiresAt.toISOString(),
      app_id,
    ],
  );

  return { access_token, refresh_token, expiresAt };
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
