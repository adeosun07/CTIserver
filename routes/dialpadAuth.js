import express from "express";
import { connect, callback } from "../controllers/dialpadAuthController.js";

const router = express.Router();

// Redirects to Dialpad authorization URL
router.get("/connect", connect);

// OAuth callback endpoint
router.get("/callback", callback);

export default router;
