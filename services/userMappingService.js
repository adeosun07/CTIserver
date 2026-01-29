/**
 * Dialpad User Mapping Service
 *
 * Maps Dialpad user IDs to CRM user IDs for:
 * - Call attribution
 * - Voicemail targeting
 * - Targeted WebSocket delivery
 * - Agent mapping
 */

import pool from "../db.js";

/**
 * Create or update a user mapping
 *
 * @param {string} app_id - Application ID
 * @param {number} dialpad_user_id - Dialpad user ID
 * @param {string} crm_user_id - CRM user ID (any string identifier)
 * @returns {Promise<object>} - Created/updated mapping
 */
export async function upsertUserMapping(app_id, dialpad_user_id, crm_user_id) {
  try {
    // Check if mapping already exists
    const existing = await pool.query(
      `SELECT id FROM dialpad_user_mappings 
       WHERE app_id = $1 AND dialpad_user_id = $2 LIMIT 1`,
      [app_id, dialpad_user_id],
    );

    if (existing.rowCount > 0) {
      // Update existing mapping
      const result = await pool.query(
        `UPDATE dialpad_user_mappings SET
           crm_user_id = $1,
           updated_at = now()
         WHERE app_id = $2 AND dialpad_user_id = $3
         RETURNING *`,
        [crm_user_id, app_id, dialpad_user_id],
      );
      console.log(
        `[UserMapping] Updated mapping: Dialpad ${dialpad_user_id} → CRM ${crm_user_id}`,
      );
      return result.rows[0];
    }

    // Create new mapping
    const result = await pool.query(
      `INSERT INTO dialpad_user_mappings (app_id, dialpad_user_id, crm_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [app_id, dialpad_user_id, crm_user_id],
    );

    const mapping = result.rows[0];
    console.log(
      `[UserMapping] Created mapping: Dialpad ${dialpad_user_id} → CRM ${crm_user_id}`,
    );
    return mapping;
  } catch (err) {
    console.error("[UserMapping] Error upserting mapping:", err);
    throw err;
  }
}

/**
 * Get mapping by Dialpad user ID
 * @param {string} app_id - Application ID
 * @param {number} dialpad_user_id - Dialpad user ID
 * @returns {Promise<object|null>} - Mapping or null
 */
export async function getMappingByDialpadId(app_id, dialpad_user_id) {
  try {
    const result = await pool.query(
      `SELECT * FROM dialpad_user_mappings 
       WHERE app_id = $1 AND dialpad_user_id = $2 LIMIT 1`,
      [app_id, dialpad_user_id],
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error("[UserMapping] Error fetching mapping:", err);
    throw err;
  }
}

/**
 * Get mapping by CRM user ID
 * @param {string} app_id - Application ID
 * @param {string} crm_user_id - CRM user ID
 * @returns {Promise<object|null>} - Mapping or null
 */
export async function getMappingByCrmId(app_id, crm_user_id) {
  try {
    const result = await pool.query(
      `SELECT * FROM dialpad_user_mappings 
       WHERE app_id = $1 AND crm_user_id = $2 LIMIT 1`,
      [app_id, crm_user_id],
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error("[UserMapping] Error fetching mapping:", err);
    throw err;
  }
}

/**
 * Get all mappings for an app with pagination
 * @param {string} app_id - Application ID
 * @param {object} options - Query options
 * @param {number} options.limit - Result limit (default 100)
 * @param {number} options.offset - Result offset (default 0)
 * @returns {Promise<object>} - { mappings, total }
 */
export async function getAllMappings(app_id, options = {}) {
  const { limit = 100, offset = 0 } = options;

  try {
    const [mappingsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM dialpad_user_mappings 
         WHERE app_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [app_id, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM dialpad_user_mappings WHERE app_id = $1`,
        [app_id],
      ),
    ]);

    return {
      mappings: mappingsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  } catch (err) {
    console.error("[UserMapping] Error fetching all mappings:", err);
    throw err;
  }
}

/**
 * Delete a user mapping
 * @param {string} app_id - Application ID
 * @param {string} mapping_id - Mapping UUID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export async function deleteMapping(app_id, mapping_id) {
  try {
    const result = await pool.query(
      `DELETE FROM dialpad_user_mappings 
       WHERE id = $1 AND app_id = $2 
       RETURNING id`,
      [mapping_id, app_id],
    );

    if (result.rowCount > 0) {
      console.log(`[UserMapping] Deleted mapping ${mapping_id}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error("[UserMapping] Error deleting mapping:", err);
    throw err;
  }
}

/**
 * Delete mapping by Dialpad user ID
 * @param {string} app_id - Application ID
 * @param {number} dialpad_user_id - Dialpad user ID
 * @returns {Promise<boolean>} - True if deleted
 */
export async function deleteMappingByDialpadId(app_id, dialpad_user_id) {
  try {
    const result = await pool.query(
      `DELETE FROM dialpad_user_mappings 
       WHERE app_id = $1 AND dialpad_user_id = $2 
       RETURNING id`,
      [app_id, dialpad_user_id],
    );

    if (result.rowCount > 0) {
      console.log(
        `[UserMapping] Deleted mapping for Dialpad user ${dialpad_user_id}`,
      );
      return true;
    }
    return false;
  } catch (err) {
    console.error("[UserMapping] Error deleting mapping:", err);
    throw err;
  }
}

/**
 * Batch upsert user mappings (useful for syncing from CRM)
 * @param {string} app_id - Application ID
 * @param {array<{dialpad_user_id, crm_user_id}>} mappings - Array of mappings
 * @returns {Promise<number>} - Count of created/updated mappings
 */
export async function batchUpsertMappings(app_id, mappings) {
  if (!mappings || mappings.length === 0) {
    return 0;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let count = 0;
    for (const { dialpad_user_id, crm_user_id } of mappings) {
      await client.query(
        `INSERT INTO dialpad_user_mappings (app_id, dialpad_user_id, crm_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (app_id, dialpad_user_id) DO UPDATE SET
           crm_user_id = EXCLUDED.crm_user_id,
           updated_at = now()`,
        [app_id, dialpad_user_id, crm_user_id],
      );
      count++;
    }

    await client.query("COMMIT");
    console.log(
      `[UserMapping] Batch upserted ${count} mappings for app ${app_id}`,
    );
    return count;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[UserMapping] Error in batch upsert:", err);
    throw err;
  } finally {
    client.release();
  }
}
