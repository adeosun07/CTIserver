import {
  listCalls,
  getCallById,
  getActiveCalls,
} from "../services/callsService.js";

/**
 * Calls API Controller
 *
 * Thin controllers that delegate to the service layer.
 * Assumes req.app_id is set by apiKeyAuth middleware.
 */

/**
 * GET /calls
 * List calls with optional filters
 */
export async function list(req, res) {
  try {
    const filters = {
      status: req.query.status,
      direction: req.query.direction,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    };

    const result = await listCalls(req.app_id, filters);

    return res.status(200).json({
      success: true,
      data: result.calls,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("[CallsController] Error listing calls:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch calls",
    });
  }
}

/**
 * GET /calls/:id
 * Get a single call by ID
 */
export async function getById(req, res) {
  try {
    const { id } = req.params;

    // Basic UUID validation
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid call ID format",
      });
    }

    const call = await getCallById(req.app_id, id);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Call not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: call,
    });
  } catch (err) {
    console.error("[CallsController] Error fetching call:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch call",
    });
  }
}

/**
 * GET /calls/active
 * Get active calls (ringing or active status)
 */
export async function getActive(req, res) {
  try {
    const filters = {
      direction: req.query.direction,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    };

    const result = await getActiveCalls(req.app_id, filters);

    return res.status(200).json({
      success: true,
      data: result.calls,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("[CallsController] Error fetching active calls:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch active calls",
    });
  }
}
