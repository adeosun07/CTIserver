import express from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import * as messagesController from "../controllers/messagesController.js";

const router = express.Router();

/**
 * Messages API Routes
 * Base path: /api/messages
 */

/**
 * GET /api/messages
 * List messages with optional filters
 */
router.get("/", apiKeyAuth, messagesController.list);

/**
 * GET /api/messages/:id
 * Get a single message by UUID
 */
router.get("/:id", apiKeyAuth, messagesController.getById);

export default router;
