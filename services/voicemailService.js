/**
 * Voicemail Service
 *
 * Handles creation, retrieval, and updates of voicemail records
 * Supports voicemail as first-class entity independent of calls
 * Integrates with WebSocket broadcasting for real-time updates
 */

import pool from "../db.js";
import { broadcastToApp, broadcastToUser } from "./websocketManager.js";

/**
 * Create or update a voicemail record
 * UPSERT logic: Update if dialpad_call_id exists, otherwise create
 *
 * @param {string} app_id - Application ID
 * @param {object} voicemailData - Voicemail details
 * @param {number} voicemailData.dialpad_call_id - Dialpad call ID (optional if voicemail standalone)
 * @param {number} voicemailData.dialpad_user_id - Dialpad user ID (recipient)
 * @param {string} voicemailData.from_number - Caller number
 * @param {string} voicemailData.to_number - Recipient number
 * @param {string} voicemailData.recording_url - URL to voicemail recording
 * @param {string} voicemailData.transcript - Voicemail transcript (optional)
 * @param {number} voicemailData.duration_seconds - Duration in seconds
 * @returns {Promise<object>} - Created/updated voicemail record
 */
export async function upsertVoicemail(app_id, voicemailData) {
  const {
    dialpad_call_id,
    dialpad_user_id,
    from_number,
    to_number,
    recording_url,
    transcript,
    duration_seconds,
  } = voicemailData;

  try {
    // If dialpad_call_id provided, check if voicemail exists
    if (dialpad_call_id) {
      const existing = await pool.query(
        `SELECT id FROM voicemails 
         WHERE app_id = $1 AND dialpad_call_id = $2 LIMIT 1`,
        [app_id, dialpad_call_id],
      );

      if (existing.rowCount > 0) {
        // Update existing
        const result = await pool.query(
          `UPDATE voicemails SET
             recording_url = $1,
             transcript = $2,
             duration_seconds = $3,
             updated_at = now()
           WHERE app_id = $4 AND dialpad_call_id = $5
           RETURNING *`,
          [
            recording_url,
            transcript,
            duration_seconds,
            app_id,
            dialpad_call_id,
          ],
        );
        console.log(
          `[Voicemail] Updated voicemail for call ${dialpad_call_id}`,
        );
        return result.rows[0];
      }
    }

    // For standalone voicemails (no dialpad_call_id), check for recent duplicates
    // within the last minute to prevent duplicate creations from retries
    if (!dialpad_call_id && dialpad_user_id && from_number) {
      const recentDuplicate = await pool.query(
        `SELECT id FROM voicemails 
         WHERE app_id = $1 
         AND dialpad_user_id = $2 
         AND from_number = $3 
         AND created_at > now() - interval '1 minute'
         LIMIT 1`,
        [app_id, dialpad_user_id, from_number],
      );

      if (recentDuplicate.rowCount > 0) {
        console.log(
          `[Voicemail] Duplicate voicemail detected (user: ${dialpad_user_id}, from: ${from_number}). Skipping creation.`,
        );
        return recentDuplicate.rows[0];
      }
    }

    // Create new voicemail
    const result = await pool.query(
      `INSERT INTO voicemails (
        app_id, dialpad_call_id, dialpad_user_id, 
        from_number, to_number, recording_url, transcript, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        app_id,
        dialpad_call_id || null,
        dialpad_user_id,
        from_number,
        to_number,
        recording_url,
        transcript || null,
        duration_seconds,
      ],
    );

    const voicemail = result.rows[0];
    console.log(
      `[Voicemail] Created voicemail ${voicemail.id} for user ${dialpad_user_id}`,
    );

    // Broadcast to WebSocket if user mapping exists
    if (dialpad_user_id) {
      await broadcastToUser(app_id, dialpad_user_id, {
        event: "voicemail.received",
        voicemail_id: voicemail.id,
        dialpad_call_id: voicemail.dialpad_call_id,
        from_number: voicemail.from_number,
        to_number: voicemail.to_number,
        recording_url: voicemail.recording_url,
        duration_seconds: voicemail.duration_seconds,
        timestamp: voicemail.created_at,
      });
    } else {
      // Broadcast to entire app if no user mapping
      broadcastToApp(app_id, {
        event: "voicemail.received",
        voicemail_id: voicemail.id,
        dialpad_call_id: voicemail.dialpad_call_id,
        from_number: voicemail.from_number,
        to_number: voicemail.to_number,
        timestamp: voicemail.created_at,
      });
    }

    return voicemail;
  } catch (err) {
    console.error("[Voicemail] Error upserting voicemail:", err);
    throw err;
  }
}

/**
 * Get voicemail by ID with tenant isolation
 * @param {string} app_id - Application ID
 * @param {string} voicemail_id - Voicemail UUID
 * @returns {Promise<object|null>} - Voicemail record or null
 */
export async function getVoicemailById(app_id, voicemail_id) {
  try {
    const result = await pool.query(
      `SELECT * FROM voicemails WHERE id = $1 AND app_id = $2 LIMIT 1`,
      [voicemail_id, app_id],
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error("[Voicemail] Error fetching voicemail:", err);
    throw err;
  }
}

/**
 * Get all voicemails for an app with pagination
 * @param {string} app_id - Application ID
 * @param {object} options - Query options
 * @param {number} options.limit - Result limit (default 50)
 * @param {number} options.offset - Result offset (default 0)
 * @param {number} options.dialpad_user_id - Filter by user ID (optional)
 * @returns {Promise<object>} - { voicemails, total }
 */
export async function getVoicemails(app_id, options = {}) {
  const { limit = 50, offset = 0, dialpad_user_id } = options;

  try {
    let query = `SELECT * FROM voicemails WHERE app_id = $1`;
    let countQuery = `SELECT COUNT(*) FROM voicemails WHERE app_id = $1`;
    let params = [app_id];

    if (dialpad_user_id) {
      query += ` AND dialpad_user_id = $2`;
      countQuery += ` AND dialpad_user_id = $2`;
      params.push(dialpad_user_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [voicemailsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, -2)),
    ]);

    return {
      voicemails: voicemailsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } catch (err) {
    console.error("[Voicemail] Error fetching voicemails:", err);
    throw err;
  }
}

/**
 * Link voicemail to a call (if voicemail was left on unanswered call)
 * @param {string} app_id - Application ID
 * @param {number} dialpad_call_id - Dialpad call ID
 * @param {string} voicemail_id - Voicemail UUID
 * @returns {Promise<void>}
 */
export async function linkVoicemailToCall(
  app_id,
  dialpad_call_id,
  voicemail_id,
) {
  try {
    await pool.query(
      `UPDATE voicemails SET dialpad_call_id = $1 
       WHERE id = $2 AND app_id = $3`,
      [dialpad_call_id, voicemail_id, app_id],
    );
    console.log(
      `[Voicemail] Linked voicemail ${voicemail_id} to call ${dialpad_call_id}`,
    );
  } catch (err) {
    console.error("[Voicemail] Error linking voicemail:", err);
    throw err;
  }
}

/**
 * Delete voicemail (if needed)
 * @param {string} app_id - Application ID
 * @param {string} voicemail_id - Voicemail UUID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export async function deleteVoicemail(app_id, voicemail_id) {
  try {
    const result = await pool.query(
      `DELETE FROM voicemails WHERE id = $1 AND app_id = $2 RETURNING id`,
      [voicemail_id, app_id],
    );
    if (result.rowCount > 0) {
      console.log(`[Voicemail] Deleted voicemail ${voicemail_id}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error("[Voicemail] Error deleting voicemail:", err);
    throw err;
  }
}
