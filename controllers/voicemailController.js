/**
 * Internal Voicemail Controller
 * Endpoints for voicemail management (internal use)
 */

import * as voicemailService from "../services/voicemailService.js";
import { isValidUUID } from "../utils/validators.js";

/**
 * GET /internal/apps/:app_id/voicemails
 * List all voicemails for an app with pagination
 */
export async function listVoicemails_handler(req, res) {
  const { app_id } = req.params;

  // Validate UUID format
  if (!isValidUUID(app_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id must be a valid UUID",
    });
  }

  const { limit = 50, offset = 0, dialpad_user_id } = req.query;

  try {
    const result = await voicemailService.getVoicemails(app_id, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      dialpad_user_id: dialpad_user_id
        ? parseInt(dialpad_user_id, 10)
        : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.voicemails,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total: result.total,
        has_more: parseInt(offset, 10) + parseInt(limit, 10) < result.total,
      },
    });
  } catch (err) {
    console.error("[Voicemail] Error listing voicemails:", err);
    return res.status(500).json({ error: "Failed to list voicemails" });
  }
}

/**
 * GET /internal/apps/:app_id/voicemails/:voicemail_id
 * Get a specific voicemail
 */
export async function getVoicemail_handler(req, res) {
  const { app_id, voicemail_id } = req.params;

  // Validate UUID formats
  if (!isValidUUID(app_id) || !isValidUUID(voicemail_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id and voicemail_id must be valid UUIDs",
    });
  }

  try {
    const voicemail = await voicemailService.getVoicemailById(
      app_id,
      voicemail_id,
    );

    if (!voicemail) {
      return res.status(404).json({ error: "Voicemail not found" });
    }

    return res.status(200).json({
      success: true,
      data: voicemail,
    });
  } catch (err) {
    console.error("[Voicemail] Error fetching voicemail:", err);
    return res.status(500).json({ error: "Failed to fetch voicemail" });
  }
}

/**
 * DELETE /internal/apps/:app_id/voicemails/:voicemail_id
 * Delete a voicemail
 */
export async function deleteVoicemail_handler(req, res) {
  const { app_id, voicemail_id } = req.params;

  // Validate UUID formats
  if (!isValidUUID(app_id) || !isValidUUID(voicemail_id)) {
    return res.status(400).json({
      error: "Invalid request",
      message: "app_id and voicemail_id must be valid UUIDs",
    });
  }

  try {
    const deleted = await voicemailService.deleteVoicemail(
      app_id,
      voicemail_id,
    );

    if (!deleted) {
      return res.status(404).json({ error: "Voicemail not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Voicemail deleted",
    });
  } catch (err) {
    console.error("[Voicemail] Error deleting voicemail:", err);
    return res.status(500).json({ error: "Failed to delete voicemail" });
  }
}
