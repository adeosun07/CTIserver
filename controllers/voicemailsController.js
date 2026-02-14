import {
  getVoicemails,
  getVoicemailById,
} from "../services/voicemailService.js";
import { isValidUUID } from "../utils/validators.js";

/**
 * Public Voicemails API Controller (API-key based)
 *
 * Assumes req.app_id is set by apiKeyAuth middleware.
 * Returns voicemail records including recording_url so frontends can play audio.
 */

/**
 * GET /api/voicemails
 * List voicemails for the authenticated app.
 *
 * Query params:
 *   - dialpad_user_id (optional): filter by Dialpad user ID
 *   - limit (optional): default 50, max 100
 *   - offset (optional): default 0
 */
export async function list(req, res) {
  try {
    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const rawOffset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
    const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 100) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const options = {
      limit,
      offset,
      dialpad_user_id: req.query.dialpad_user_id
        ? parseInt(req.query.dialpad_user_id, 10)
        : undefined,
    };

    const result = await getVoicemails(req.app_id, options);

    return res.status(200).json({
      success: true,
      data: result.voicemails,
      pagination: {
        limit,
        offset,
        total: result.total,
        has_more: offset + limit < result.total,
      },
    });
  } catch (err) {
    console.error("[VoicemailsAPI] Error listing voicemails:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch voicemails",
    });
  }
}

/**
 * GET /api/voicemails/:id
 * Get a single voicemail by ID for the authenticated app.
 * Includes recording_url so the frontend can play the audio directly.
 */
export async function getById(req, res) {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid voicemail ID format",
      });
    }

    const voicemail = await getVoicemailById(req.app_id, id);

    if (!voicemail) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Voicemail not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: voicemail,
    });
  } catch (err) {
    console.error("[VoicemailsAPI] Error fetching voicemail:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch voicemail",
    });
  }
}
