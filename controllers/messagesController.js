import { listMessages, getMessageById } from "../services/messagesService.js";

/**
 * Messages API Controller
 * Assumes req.app_id is set by apiKeyAuth middleware.
 */

export async function list(req, res) {
  try {
    const filters = {
      direction: req.query.direction,
      from: req.query.from,
      to: req.query.to,
      dialpad_user_id: req.query.dialpad_user_id,
      limit: req.query.limit,
      offset: req.query.offset,
    };

    const result = await listMessages(req.app_id, filters);

    return res.status(200).json({
      success: true,
      data: result.messages,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("[MessagesController] Error listing messages:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch messages",
    });
  }
}

export async function getById(req, res) {
  try {
    const { id } = req.params;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid message ID format",
      });
    }

    const message = await getMessageById(req.app_id, id);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Message not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: message,
    });
  } catch (err) {
    console.error("[MessagesController] Error fetching message:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch message",
    });
  }
}
