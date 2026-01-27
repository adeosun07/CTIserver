import express from "express";
import { handleDialpadWebhook } from "../controllers/webhookController.js";

const router = express.Router();

// Dialpad will POST webhook events here. We use the JSON parser with raw body captured
// by the global `express.json({ verify })` middleware so `req.rawBody` is available
// for verifying signatures.
router.post("/dialpad", handleDialpadWebhook);

export default router;
