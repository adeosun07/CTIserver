import express from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import * as callsController from "../controllers/callsController.js";

const router = express.Router();

/**
 * Calls API Routes
 *
 * All routes require API key authentication via x-app-api-key header.
 * Tenant isolation is enforced at the service layer.
 *
 * Base path: /api/calls
 */

/**
 * GET /api/calls/active
 * Get active calls (ringing or active status)
 *
 * Query params:
 *   - direction: inbound | outbound
 *   - from: phone number
 *   - to: phone number
 *   - limit: max 100, default 50
 *   - offset: default 0
 *
 * Note: This must come BEFORE /api/calls/:id to avoid "active" being treated as an ID
 */
router.get("/active", apiKeyAuth, callsController.getActive);

/**
 * GET /api/calls
 * List calls with optional filters
 *
 * Query params:
 *   - status: ringing | active | ended | missed | rejected | voicemail
 *   - direction: inbound | outbound
 *   - from: phone number
 *   - to: phone number
 *   - limit: max 100, default 50
 *   - offset: default 0
 *
 * Response:
 *   {
 *     success: true,
 *     data: [...calls],
 *     pagination: { limit, offset, total, has_more }
 *   }
 */
router.get("/", apiKeyAuth, callsController.list);

/**
 * GET /api/calls/:id
 * Get a single call by UUID
 *
 * Params:
 *   - id: UUID of the call
 *
 * Response:
 *   {
 *     success: true,
 *     data: { ...call }
 *   }
 *
 * Errors:
 *   - 400: Invalid UUID format
 *   - 404: Call not found or doesn't belong to app
 */
router.get("/:id", apiKeyAuth, callsController.getById);

export default router;
