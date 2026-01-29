/**
 * Internal User Mapping Controller
 * Endpoints for Dialpad → CRM user mapping management
 */

import * as userMappingService from "../services/userMappingService.js";
import { isValidUUID, isValidInteger } from "../utils/validators.js";

/**
 * POST /internal/apps/:app_id/users/map
 * Create or update a user mapping
 */
export async function mapUser_handler(req, res) {
  const { app_id } = req.params;
  const { dialpad_user_id, crm_user_id } = req.body;

  // Validate app_id UUID
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  // Validate inputs
  if (!dialpad_user_id || !crm_user_id) {
    return res.status(400).json({
      error: "Missing required fields",
      required: ["dialpad_user_id", "crm_user_id"],
    });
  }

  // Validate dialpad_user_id is a positive integer
  if (!isValidInteger(dialpad_user_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "dialpad_user_id must be a positive integer",
    });
  }

  try {
    const mapping = await userMappingService.upsertUserMapping(
      app_id,
      parseInt(dialpad_user_id, 10),
      String(crm_user_id),
    );

    return res.status(200).json({
      success: true,
      data: mapping,
      message: "User mapping created/updated",
    });
  } catch (err) {
    console.error("[UserMapping] Error mapping user:", err);
    return res.status(500).json({ error: "Failed to map user" });
  }
}

/**
 * GET /internal/apps/:app_id/users/mappings
 * Get all user mappings for an app with pagination
 */
export async function listMappings_handler(req, res) {
  const { app_id } = req.params;

  // Validate app_id UUID
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  const { limit = 100, offset = 0 } = req.query;

  try {
    const result = await userMappingService.getAllMappings(app_id, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    return res.status(200).json({
      success: true,
      data: result.mappings,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total: result.total,
        has_more: parseInt(offset, 10) + parseInt(limit, 10) < result.total,
      },
    });
  } catch (err) {
    console.error("[UserMapping] Error listing mappings:", err);
    return res.status(500).json({ error: "Failed to list mappings" });
  }
}

/**
 * GET /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
 * Get mapping by Dialpad user ID
 */
export async function getMappingByDialpad_handler(req, res) {
  const { app_id, dialpad_user_id } = req.params;

  try {
    const mapping = await userMappingService.getMappingByDialpadId(
      app_id,
      parseInt(dialpad_user_id, 10),
    );

    if (!mapping) {
      return res.status(404).json({ error: "Mapping not found" });
    }

    return res.status(200).json({
      success: true,
      data: mapping,
    });
  } catch (err) {
    console.error("[UserMapping] Error fetching mapping:", err);
    return res.status(500).json({ error: "Failed to fetch mapping" });
  }
}

/**
 * GET /internal/apps/:app_id/users/mappings/crm/:crm_user_id
 * Get mapping by CRM user ID
 */
export async function getMappingByCrm_handler(req, res) {
  const { app_id, crm_user_id } = req.params;

  try {
    const mapping = await userMappingService.getMappingByCrmId(
      app_id,
      crm_user_id,
    );

    if (!mapping) {
      return res.status(404).json({ error: "Mapping not found" });
    }

    return res.status(200).json({
      success: true,
      data: mapping,
    });
  } catch (err) {
    console.error("[UserMapping] Error fetching mapping:", err);
    return res.status(500).json({ error: "Failed to fetch mapping" });
  }
}

/**
 * DELETE /internal/apps/:app_id/users/mappings/:mapping_id
 * Delete a user mapping
 */
export async function deleteMapping_handler(req, res) {
  const { app_id, mapping_id } = req.params;

  try {
    const deleted = await userMappingService.deleteMapping(app_id, mapping_id);

    if (!deleted) {
      return res.status(404).json({ error: "Mapping not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Mapping deleted",
    });
  } catch (err) {
    console.error("[UserMapping] Error deleting mapping:", err);
    return res.status(500).json({ error: "Failed to delete mapping" });
  }
}

/**
 * DELETE /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
 * Delete mapping by Dialpad user ID
 */
export async function deleteMappingByDialpad_handler(req, res) {
  const { app_id, dialpad_user_id } = req.params;

  try {
    const deleted = await userMappingService.deleteMappingByDialpadId(
      app_id,
      parseInt(dialpad_user_id, 10),
    );

    if (!deleted) {
      return res.status(404).json({ error: "Mapping not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Mapping deleted",
    });
  } catch (err) {
    console.error("[UserMapping] Error deleting mapping:", err);
    return res.status(500).json({ error: "Failed to delete mapping" });
  }
}

/**
 * POST /internal/apps/:app_id/users/batch-map
 * Batch create/update multiple user mappings
 * Useful for syncing from CRM
 */
export async function batchMapUsers_handler(req, res) {
  const { app_id } = req.params;
  const { mappings } = req.body;

  if (!Array.isArray(mappings)) {
    return res.status(400).json({
      error: "Invalid request",
      expected: { mappings: "array of {dialpad_user_id, crm_user_id}" },
    });
  }

  try {
    const count = await userMappingService.batchUpsertMappings(
      app_id,
      mappings,
    );

    return res.status(200).json({
      success: true,
      message: `Batch mapped ${count} users`,
      count,
    });
  } catch (err) {
    console.error("[UserMapping] Error in batch mapping:", err);
    return res.status(500).json({ error: "Failed to batch map users" });
  }
}
