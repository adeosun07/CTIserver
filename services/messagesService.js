import pool from "../db.js";

/**
 * Messages Service
 *
 * Read-only queries for SMS/message data with tenant isolation.
 */

const VALID_DIRECTIONS = ["inbound", "outbound"];

function validateFilters(filters = {}) {
  const validated = {};

  if (filters.direction) {
    const direction = String(filters.direction).toLowerCase();
    if (VALID_DIRECTIONS.includes(direction)) {
      validated.direction = direction;
    }
  }

  if (filters.from) {
    validated.from = String(filters.from).trim();
  }

  if (filters.to) {
    validated.to = String(filters.to).trim();
  }

  if (filters.dialpad_user_id) {
    const userId = parseInt(filters.dialpad_user_id, 10);
    if (!Number.isNaN(userId)) {
      validated.dialpad_user_id = userId;
    }
  }

  validated.limit = Math.min(parseInt(filters.limit) || 50, 100);
  validated.offset = Math.max(parseInt(filters.offset) || 0, 0);

  return validated;
}

function buildWhereClause(app_id, filters) {
  const conditions = ["app_id = $1"];
  const params = [app_id];
  let paramIndex = 2;

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

  if (filters.dialpad_user_id) {
    conditions.push(`dialpad_user_id = $${paramIndex}`);
    params.push(filters.dialpad_user_id);
    paramIndex++;
  }

  return {
    whereClause: conditions.join(" AND "),
    params,
    paramIndex,
  };
}

function formatMessageRecord(message) {
  return {
    id: message.id,
    dialpad_message_id: message.dialpad_message_id,
    direction: message.direction,
    from_number: message.from_number,
    to_number: message.to_number,
    text: message.text,
    dialpad_user_id: message.dialpad_user_id,
    sent_at: message.sent_at,
    created_at: message.created_at,
  };
}

export async function listMessages(app_id, filters = {}) {
  const validated = validateFilters(filters);
  const { whereClause, params, paramIndex } = buildWhereClause(
    app_id,
    validated,
  );

  const limitParam = `$${paramIndex}`;
  const offsetParam = `$${paramIndex + 1}`;
  params.push(validated.limit, validated.offset);

  const result = await pool.query(
    `SELECT
       id, dialpad_message_id, direction, from_number, to_number,
       text, dialpad_user_id, sent_at, created_at
     FROM messages
     WHERE ${whereClause}
     ORDER BY sent_at DESC NULLS LAST, created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM messages
     WHERE ${whereClause}`,
    params.slice(0, -2),
  );

  const total = parseInt(countResult.rows[0].total, 10);
  const messages = result.rows.map(formatMessageRecord);

  return {
    messages,
    pagination: {
      limit: validated.limit,
      offset: validated.offset,
      total,
      has_more: validated.offset + validated.limit < total,
    },
  };
}

export async function getMessageById(app_id, message_id) {
  const result = await pool.query(
    `SELECT
       id, dialpad_message_id, direction, from_number, to_number,
       text, dialpad_user_id, sent_at, created_at
     FROM messages
     WHERE id = $1 AND app_id = $2
     LIMIT 1`,
    [message_id, app_id],
  );

  return result.rowCount > 0 ? formatMessageRecord(result.rows[0]) : null;
}
