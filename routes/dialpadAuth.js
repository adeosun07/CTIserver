import express from "express";
import {
  connect,
  callback,
  disconnect,
} from "../controllers/dialpadAuthController.js";

const router = express.Router();

// Redirects to Dialpad authorization URL
router.get("/connect", connect);

// OAuth callback endpoint
router.get("/callback", callback);

// Disconnect and revoke tokens
router.post("/disconnect/:app_id", disconnect);

export default router;
