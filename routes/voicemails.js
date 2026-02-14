import express from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import * as voicemailsController from "../controllers/voicemailsController.js";

const router = express.Router();

/**
 * Voicemails API Routes
 * Base path: /api/voicemails
 *
 * All routes require API key authentication via x-app-api-key header.
 */

/**
 * GET /api/voicemails
 * List voicemails with optional filters
 *
 * Query params:
 *   - dialpad_user_id: filter by Dialpad user ID
 *   - limit: max 100, default 50
 *   - offset: default 0
 */
router.get("/", apiKeyAuth, voicemailsController.list);

/**
 * GET /api/voicemails/:id
 * Get a single voicemail by UUID
 */
router.get("/:id", apiKeyAuth, voicemailsController.getById);

export default router;
