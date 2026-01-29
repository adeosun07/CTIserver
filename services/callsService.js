import pool from "../db.js";

/**
 * Calls Service
 *
 * Reusable query logic for fetching calls.
 * Enforces tenant isolation at the SQL level.
 *
 * All queries require app_id to ensure multi-tenant security.
 */

/**
 * Valid call status values for filtering
 */
const VALID_STATUSES = [
  "ringing",
  "active",
  "ended",
  "missed",
  "rejected",
  "voicemail",
];

/**
 * Valid direction values for filtering
 */
const VALID_DIRECTIONS = ["inbound", "outbound"];

/**
 * Sanitize and validate query parameters
 */
function validateFilters(filters = {}) {
  const validated = {};

  // Status filter
  if (filters.status) {
    const status = String(filters.status).toLowerCase();
    if (VALID_STATUSES.includes(status)) {
      validated.status = status;
    }
  }

  // Direction filter
  if (filters.direction) {
    const direction = String(filters.direction).toLowerCase();
    if (VALID_DIRECTIONS.includes(direction)) {
      validated.direction = direction;
    }
  }

  // Phone number filters (basic sanitization)
  if (filters.from) {
    validated.from = String(filters.from).trim();
  }

  if (filters.to) {
    validated.to = String(filters.to).trim();
  }

  // Pagination
  validated.limit = Math.min(parseInt(filters.limit) || 50, 100); // Max 100
  validated.offset = Math.max(parseInt(filters.offset) || 0, 0);

  return validated;
}

/**
 * Build WHERE clause and params for call filters
 */
function buildWhereClause(app_id, filters) {
  const conditions = ["app_id = $1"]; // Tenant isolation
  const params = [app_id];
  let paramIndex = 2;

  if (filters.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.direction) {
    conditions.push(`direction = $${paramIndex}`);
    params.push(filters.direction);
    paramIndex++;
  }

  if (filters.from) {
    conditions.push(`from_number = $${paramIndex}`);
    params.push(filters.from);
    paramIndex++;
  }

  if (filters.to) {
    conditions.push(`to_number = $${paramIndex}`);
    params.push(filters.to);
    paramIndex++;
  }

  return {
    whereClause: conditions.join(" AND "),
    params,
    paramIndex,
  };
}

/**
 * Format call record for API response
 * Removes internal fields and raw payloads
 */
function formatCallRecord(call) {
  return {
    id: call.id,
    dialpad_call_id: call.dialpad_call_id,
    direction: call.direction,
    from_number: call.from_number,
    to_number: call.to_number,
    status: call.status,
    dialpad_user_id: call.dialpad_user_id,
    started_at: call.started_at,
    ended_at: call.ended_at,
    duration_seconds: call.duration_seconds,
    recording_url: call.recording_url,
    created_at: call.created_at,
  };
}

/**
 * List calls for an app with optional filters
 *
 * @param {string} app_id - UUID of the app (tenant)
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} - { calls, pagination }
 */
export async function listCalls(app_id, filters = {}) {
  const validated = validateFilters(filters);
  const { whereClause, params, paramIndex } = buildWhereClause(
    app_id,
    validated,
  );

  // Add limit and offset to params
  const limitParam = `$${paramIndex}`;
  const offsetParam = `$${paramIndex + 1}`;
  params.push(validated.limit, validated.offset);

  // Execute query
  const result = await pool.query(
    `SELECT 
       id, dialpad_call_id, direction, from_number, to_number,
       status, dialpad_user_id, started_at, ended_at,
       duration_seconds, recording_url, created_at
     FROM calls
     WHERE ${whereClause}
     ORDER BY started_at DESC NULLS LAST
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  // Get total count for pagination
  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM calls
     WHERE ${whereClause}`,
    params.slice(0, -2), // Exclude limit and offset
  );

  const total = parseInt(countResult.rows[0].total);
  const calls = result.rows.map(formatCallRecord);

  return {
    calls,
    pagination: {
      limit: validated.limit,
      offset: validated.offset,
      total,
      has_more: validated.offset + validated.limit < total,
    },
  };
}

/**
 * Get a single call by ID
 *
 * @param {string} app_id - UUID of the app (tenant)
 * @param {string} call_id - UUID of the call
 * @returns {Promise<Object|null>} - Call record or null
 */
export async function getCallById(app_id, call_id) {
  // Tenant isolation: app_id must match
  const result = await pool.query(
    `SELECT 
       id, dialpad_call_id, direction, from_number, to_number,
       status, dialpad_user_id, started_at, ended_at,
       duration_seconds, recording_url, created_at
     FROM calls
     WHERE id = $1 AND app_id = $2
     LIMIT 1`,
    [call_id, app_id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return formatCallRecord(result.rows[0]);
}

/**
 * Get active calls for an app
 * Shortcut for status IN ('ringing', 'active')
 *
 * @param {string} app_id - UUID of the app (tenant)
 * @param {Object} filters - Optional additional filters
 * @returns {Promise<Object>} - { calls, pagination }
 */
export async function getActiveCalls(app_id, filters = {}) {
  const validated = validateFilters(filters);

  // Build WHERE clause for active calls
  const conditions = ["app_id = $1", `status IN ('ringing', 'active')`];
  const params = [app_id];
  let paramIndex = 2;

  if (validated.direction) {
    conditions.push(`direction = $${paramIndex}`);
    params.push(validated.direction);
    paramIndex++;
  }

  if (validated.from) {
    conditions.push(`from_number = $${paramIndex}`);
    params.push(validated.from);
    paramIndex++;
  }

  if (validated.to) {
    conditions.push(`to_number = $${paramIndex}`);
    params.push(validated.to);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Add limit and offset
  const limitParam = `$${paramIndex}`;
  const offsetParam = `$${paramIndex + 1}`;
  params.push(validated.limit, validated.offset);

  // Execute query
  const result = await pool.query(
    `SELECT 
       id, dialpad_call_id, direction, from_number, to_number,
       status, dialpad_user_id, started_at, ended_at,
       duration_seconds, recording_url, created_at
     FROM calls
     WHERE ${whereClause}
     ORDER BY started_at DESC NULLS LAST
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM calls
     WHERE ${whereClause}`,
    params.slice(0, -2),
  );

  const total = parseInt(countResult.rows[0].total);
  const calls = result.rows.map(formatCallRecord);

  return {
    calls,
    pagination: {
      limit: validated.limit,
      offset: validated.offset,
      total,
      has_more: validated.offset + validated.limit < total,
    },
  };
}
