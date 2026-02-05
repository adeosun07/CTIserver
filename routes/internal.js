/**
 * Internal Routes (Sandbox/Admin Use Only)
 *
 * These endpoints are designed for internal administration:
 * - API key management
 * - Voicemail operations
 * - User mapping synchronization
 *
 * SECURITY: All routes are protected by internalAuth middleware
 * which requires INTERNAL_API_SECRET in Authorization header.
 *
 * Usage:
 *   curl -X POST http://localhost:4000/internal/apps/:app_id/api-key \
 *     -H "Authorization: Bearer <your-internal-secret>"
 */

import express from "express";
import { internalAuth } from "../middleware/internalAuth.js";
import * as apiKeyController from "../controllers/apiKeyController.js";
import * as voicemailController from "../controllers/voicemailController.js";
import * as userMappingController from "../controllers/userMappingController.js";
import * as webhookManagementController from "../controllers/webhookManagementController.js";

const router = express.Router();

// =============================================================================
// APPLY AUTHENTICATION TO ALL INTERNAL ROUTES
// =============================================================================
router.use(internalAuth);

// =============================================================================
// APP MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * POST /internal/apps
 * Create a new app with auto-generated UUID and initial API key
 * Enables apps to self-register on first contact
 *
 * Body: { "name": "My App Name" }
 * Returns: { app_id, api_key }
 */
router.post("/apps", apiKeyController.createApp_handler);

// =============================================================================
// API KEY MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * POST /internal/apps/:app_id/api-key
 * Generate a new API key (creates or rotates existing)
 * Returns the key ONCE - never logged or retrievable again
 */
router.post("/apps/:app_id/api-key", apiKeyController.generateApiKey_handler);

/**
 * POST /internal/apps/:app_id/api-key/revoke
 * Revoke the current API key - prevents all API access
 */
router.post(
  "/apps/:app_id/api-key/revoke",
  apiKeyController.revokeApiKey_handler,
);

/**
 * GET /internal/apps/:app_id/api-key/status
 * Check API key status (without revealing the key)
 */
router.get(
  "/apps/:app_id/api-key/status",
  apiKeyController.checkApiKeyStatus_handler,
);

/**
 * GET /internal/apps/:app_id/api-key/audit
 * View audit log of API key rotations and revocations
 */
router.get(
  "/apps/:app_id/api-key/audit",
  apiKeyController.getKeyAuditLog_handler,
);

// =============================================================================
// VOICEMAIL MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /internal/apps/:app_id/voicemails
 * List all voicemails for an app
 * Query params:
 * - limit (default 50)
 * - offset (default 0)
 * - dialpad_user_id (optional filter)
 */
router.get(
  "/apps/:app_id/voicemails",
  voicemailController.listVoicemails_handler,
);

/**
 * GET /internal/apps/:app_id/voicemails/:voicemail_id
 * Get a specific voicemail
 */
router.get(
  "/apps/:app_id/voicemails/:voicemail_id",
  voicemailController.getVoicemail_handler,
);

/**
 * DELETE /internal/apps/:app_id/voicemails/:voicemail_id
 * Delete a voicemail
 */
router.delete(
  "/apps/:app_id/voicemails/:voicemail_id",
  voicemailController.deleteVoicemail_handler,
);

// =============================================================================
// USER MAPPING ENDPOINTS
// =============================================================================

/**
 * POST /internal/apps/:app_id/users/map
 * Create or update a Dialpad → CRM user mapping
 *
 * Request body:
 * {
 *   "dialpad_user_id": 12345,
 *   "crm_user_id": "user_abc123"
 * }
 */
router.post("/apps/:app_id/users/map", userMappingController.mapUser_handler);

/**
 * GET /internal/apps/:app_id/users/mappings
 * Get all user mappings for an app
 * Query params:
 * - limit (default 100)
 * - offset (default 0)
 */
router.get(
  "/apps/:app_id/users/mappings",
  userMappingController.listMappings_handler,
);

/**
 * GET /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
 * Get mapping by Dialpad user ID
 */
router.get(
  "/apps/:app_id/users/mappings/dialpad/:dialpad_user_id",
  userMappingController.getMappingByDialpad_handler,
);

/**
 * GET /internal/apps/:app_id/users/mappings/crm/:crm_user_id
 * Get mapping by CRM user ID
 */
router.get(
  "/apps/:app_id/users/mappings/crm/:crm_user_id",
  userMappingController.getMappingByCrm_handler,
);

/**
 * DELETE /internal/apps/:app_id/users/mappings/:mapping_id
 * Delete a mapping by ID
 */
router.delete(
  "/apps/:app_id/users/mappings/:mapping_id",
  userMappingController.deleteMapping_handler,
);

/**
 * DELETE /internal/apps/:app_id/users/mappings/dialpad/:dialpad_user_id
 * Delete mapping by Dialpad user ID
 */
router.delete(
  "/apps/:app_id/users/mappings/dialpad/:dialpad_user_id",
  userMappingController.deleteMappingByDialpad_handler,
);

/**
 * POST /internal/apps/:app_id/users/batch-map
 * Batch create/update multiple user mappings
 *
 * Request body:
 * {
 *   "mappings": [
 *     { "dialpad_user_id": 12345, "crm_user_id": "user_abc" },
 *     { "dialpad_user_id": 12346, "crm_user_id": "user_def" }
 *   ]
 * }
 */
router.post(
  "/apps/:app_id/users/batch-map",
  userMappingController.batchMapUsers_handler,
);

// =============================================================================
// WEBHOOK MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * POST /internal/webhooks/create?app_id=<app_id>
 * Automatically create a webhook in Dialpad using the app's stored access token
 *
 * Query: app_id (required)
 * Body (optional):
 * {
 *   "webhook_url": "https://your-domain.com/webhooks/dialpad",
 *   "webhook_secret": "your-secret"
 * }
 *
 * If not provided, uses DIALPAD_PROD_REDIRECT_URI env and DIALPAD_WEBHOOK_SECRET
 */
router.post(
  "/webhooks/create",
  webhookManagementController.createWebhookInDialpad,
);

/**
 * GET /internal/webhooks?app_id=<app_id>
 * List all webhooks registered for an app
 */
router.get("/webhooks", webhookManagementController.listWebhooks);

/**
 * GET /internal/webhooks/:webhook_id
 * Get details of a specific webhook
 */
router.get("/webhooks/:webhook_id", webhookManagementController.getWebhook);

/**
 * DELETE /internal/webhooks/:webhook_id
 * Delete webhook metadata from the database
 * Note: This only removes the local record. You must also delete the webhook
 * on Dialpad's end using their API.
 */
router.delete(
  "/webhooks/:webhook_id",
  webhookManagementController.removeWebhook,
);

export default router;
