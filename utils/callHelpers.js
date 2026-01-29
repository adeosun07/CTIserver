/**
 * Call Processing Utilities
 *
 * Production-hardened helper functions for:
 * - Call direction normalization
 * - Status transition validation
 * - Payload sanitization
 */

/**
 * Valid call status values
 */
const CALL_STATUSES = {
  RINGING: "ringing",
  ACTIVE: "active",
  ENDED: "ended",
  MISSED: "missed",
  REJECTED: "rejected",
  VOICEMAIL: "voicemail",
};

/**
 * Valid status transitions matrix
 * Maps current status -> allowed next statuses
 */
const STATUS_TRANSITIONS = {
  [CALL_STATUSES.RINGING]: [
    CALL_STATUSES.ACTIVE,
    CALL_STATUSES.ENDED,
    CALL_STATUSES.MISSED,
    CALL_STATUSES.REJECTED,
    CALL_STATUSES.VOICEMAIL,
  ],
  [CALL_STATUSES.ACTIVE]: [CALL_STATUSES.ENDED, CALL_STATUSES.VOICEMAIL],
  [CALL_STATUSES.ENDED]: [], // Terminal state
  [CALL_STATUSES.MISSED]: [], // Terminal state
  [CALL_STATUSES.REJECTED]: [], // Terminal state
  [CALL_STATUSES.VOICEMAIL]: [], // Terminal state
};

/**
 * Normalize call direction from various Dialpad formats
 *
 * Dialpad may send: inbound, incoming, in, outbound, outgoing, out
 * We normalize to: inbound | outbound
 *
 * @param {string} direction - Raw direction value from Dialpad
 * @returns {string|null} - Normalized direction or null if invalid
 */
export function normalizeCallDirection(direction) {
  if (!direction) return null;

  const normalized = String(direction).toLowerCase().trim();

  // Inbound variations
  if (["inbound", "incoming", "in"].includes(normalized)) {
    return "inbound";
  }

  // Outbound variations
  if (["outbound", "outgoing", "out"].includes(normalized)) {
    return "outbound";
  }

  // Unknown direction - log warning but don't fail
  console.warn(`[CallHelpers] Unknown call direction: "${direction}"`);
  return null;
}

/**
 * Validate if a status transition is allowed
 *
 * Prevents invalid transitions like:
 * - ended → ringing (call already completed)
 * - missed → active (call was never answered)
 *
 * @param {string|null} currentStatus - Current call status (null if new)
 * @param {string} nextStatus - Desired next status
 * @returns {boolean} - True if transition is valid
 */
export function isValidStatusTransition(currentStatus, nextStatus) {
  // New call (no current status) - any status is valid
  if (!currentStatus) {
    return true;
  }

  // Same status - always allowed (idempotent)
  if (currentStatus === nextStatus) {
    return true;
  }

  // Check if transition is in the allowed list
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(nextStatus);
}

/**
 * Sanitize call payload for storage in calls.raw_payload
 *
 * Reduces payload size by:
 * - Truncating transcripts to 500 chars
 * - Removing large binary/metadata objects
 * - Limiting array sizes
 * - Preserving essential debugging fields
 *
 * NOTE: Full payload is preserved in webhook_events.payload
 *
 * @param {Object} payload - Raw Dialpad webhook payload
 * @returns {Object} - Sanitized payload
 */
export function sanitizeCallPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  // Deep clone to avoid mutating original
  const sanitized = JSON.parse(JSON.stringify(payload));

  /**
   * Recursive sanitization helper
   */
  function sanitizeObject(obj, depth = 0) {
    // Prevent infinite recursion
    if (depth > 5 || !obj || typeof obj !== "object") {
      return obj;
    }

    // Handle arrays - limit to 10 items
    if (Array.isArray(obj)) {
      if (obj.length > 10) {
        return [
          ...obj.slice(0, 10).map((item) => sanitizeObject(item, depth + 1)),
          { _truncated: true, original_length: obj.length },
        ];
      }
      return obj.map((item) => sanitizeObject(item, depth + 1));
    }

    // Sanitize object properties
    for (const key of Object.keys(obj)) {
      const value = obj[key];

      // Truncate transcript fields
      if (
        key.toLowerCase().includes("transcript") &&
        typeof value === "string"
      ) {
        if (value.length > 500) {
          obj[key] = value.substring(0, 500) + "... [truncated]";
        }
      }
      // Truncate voicemail transcript
      else if (key === "voicemail_transcript" && typeof value === "string") {
        if (value.length > 500) {
          obj[key] = value.substring(0, 500) + "... [truncated]";
        }
      }
      // Remove binary data fields
      else if (["binary_data", "audio_data", "file_data"].includes(key)) {
        obj[key] = "[removed - binary data]";
      }
      // Remove large metadata objects
      else if (key === "metadata" && typeof value === "object") {
        const metadataKeys = Object.keys(value);
        if (metadataKeys.length > 20) {
          obj[key] = {
            _truncated: true,
            sample_keys: metadataKeys.slice(0, 5),
            total_keys: metadataKeys.length,
          };
        } else {
          obj[key] = sanitizeObject(value, depth + 1);
        }
      }
      // Recursively sanitize nested objects
      else if (typeof value === "object" && value !== null) {
        obj[key] = sanitizeObject(value, depth + 1);
      }
    }

    return obj;
  }

  return sanitizeObject(sanitized);
}

/**
 * Get human-readable status transition error message
 *
 * @param {string} currentStatus - Current status
 * @param {string} nextStatus - Attempted next status
 * @returns {string} - Error message
 */
export function getStatusTransitionError(currentStatus, nextStatus) {
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return `Invalid status transition from "${currentStatus}" to "${nextStatus}". Allowed: [${allowed.join(", ")}]`;
}

/**
 * Validate and normalize call details
 *
 * Applies all production hardening rules:
 * - Normalizes direction
 * - Validates required fields
 *
 * @param {Object} details - Raw call details
 * @returns {Object} - Normalized details with validation info
 */
export function normalizeCallDetails(details) {
  return {
    ...details,
    direction: normalizeCallDirection(details.direction),
    _validation: {
      has_call_id: !!details.dialpad_call_id,
      has_direction: !!details.direction,
      direction_normalized:
        details.direction !== normalizeCallDirection(details.direction),
    },
  };
}

export { CALL_STATUSES };
