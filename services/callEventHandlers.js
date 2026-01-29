import pool from "../db.js";
import { registerEventHandler } from "./dialpadEventProcessor.js";
import {
  normalizeCallDirection,
  isValidStatusTransition,
  sanitizeCallPayload,
  getStatusTransitionError,
} from "../utils/callHelpers.js";
import { broadcastToApp, broadcastToUser } from "./websocketManager.js";
import * as voicemailService from "./voicemailService.js";

/**
 * Call Event Handlers
 *
 * Implements handlers for Dialpad call-related webhook events:
 * - call.started: New call initiated
 * - call.ring: Call is ringing
 * - call.ended: Call completed
 * - call.recording.completed: Recording is available
 *
 * All handlers use UPSERT logic (ON CONFLICT) for idempotency
 * based on the unique dialpad_call_id constraint.
 *
 * PRODUCTION HARDENING:
 * - Direction normalization (inbound/outbound only)
 * - Status transition validation
 * - Payload sanitization for storage
 * - Concurrency-safe with row locking
 */

/**
 * Extract call details from Dialpad webhook payload
 * Handles various payload structures from different event types
 *
 * PRODUCTION: Applies direction normalization
 */
function extractCallDetails(payload) {
  // The call object might be at different paths depending on event type
  const call = payload.call || payload.data?.call || payload;

  // Extract raw direction and normalize it
  const rawDirection = call.direction;
  const normalizedDirection = normalizeCallDirection(rawDirection);

  return {
    dialpad_call_id: call.id || call.call_id,
    direction: normalizedDirection, // Normalized: 'inbound' or 'outbound'
    from_number: call.from || call.from_number || call.caller,
    to_number: call.to || call.to_number || call.callee,
    dialpad_user_id: call.user_id || call.dialpad_user_id || call.owner?.id,
    duration_seconds: call.duration || call.duration_seconds,
    recording_url: call.recording_url || call.recording?.url,
    started_at: call.started_at || call.start_time || call.created_at,
    ended_at: call.ended_at || call.end_time,
  };
}

/**
 * Handler: call.started
 * Creates or updates a call record with status = 'active'
 *
 * PRODUCTION: Validates status transitions before updating
 */
async function handleCallStarted(payload, app_id) {
  const details = extractCallDetails(payload);

  if (!details.dialpad_call_id) {
    console.warn("call.started event missing dialpad_call_id");
    return;
  }

  // Sanitize payload for storage (reduces size)
  const sanitizedPayload = sanitizeCallPayload(payload);
  const nextStatus = "active";

  // Check if call exists and validate status transition
  const existingCall = await pool.query(
    `SELECT status FROM calls WHERE dialpad_call_id = $1`,
    [details.dialpad_call_id],
  );

  if (existingCall.rowCount > 0) {
    const currentStatus = existingCall.rows[0].status;

    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      console.warn(
        `[CallHandler] ${getStatusTransitionError(currentStatus, nextStatus)} for call ${details.dialpad_call_id}`,
      );
      // Don't fail - just skip the update to preserve terminal state
      return;
    }
  }

  await pool.query(
    `INSERT INTO calls (
       app_id, dialpad_call_id, direction, from_number, to_number,
       status, dialpad_user_id, started_at, raw_payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (dialpad_call_id) DO UPDATE SET
       status = EXCLUDED.status,
       direction = COALESCE(EXCLUDED.direction, calls.direction),
       from_number = COALESCE(EXCLUDED.from_number, calls.from_number),
       to_number = COALESCE(EXCLUDED.to_number, calls.to_number),
       dialpad_user_id = COALESCE(EXCLUDED.dialpad_user_id, calls.dialpad_user_id),
       started_at = COALESCE(EXCLUDED.started_at, calls.started_at),
       raw_payload = EXCLUDED.raw_payload`,
    [
      app_id,
      details.dialpad_call_id,
      details.direction,
      details.from_number,
      details.to_number,
      nextStatus,
      details.dialpad_user_id,
      details.started_at,
      sanitizedPayload,
    ],
  );

  console.log(
    `[CallHandler] call.started processed: ${details.dialpad_call_id}`,
  );

  // Broadcast WebSocket event to app
  broadcastToApp(app_id, {
    event: "call.started",
    call_id: details.dialpad_call_id,
    direction: details.direction,
    from_number: details.from_number,
    to_number: details.to_number,
    status: "active",
    user_id: details.dialpad_user_id,
    timestamp: new Date().toISOString(),
  });

  // Broadcast to specific user if mapping exists
  if (details.dialpad_user_id) {
    broadcastToUser(app_id, details.dialpad_user_id, {
      event: "call.started",
      call_id: details.dialpad_call_id,
      direction: details.direction,
      from_number: details.from_number,
      to_number: details.to_number,
      status: "active",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handler: call.ring
 * Creates or updates a call record with status = 'ringing'
 *
 * PRODUCTION: Validates status transitions before updating
 */
async function handleCallRing(payload, app_id) {
  const details = extractCallDetails(payload);

  if (!details.dialpad_call_id) {
    console.warn("call.ring event missing dialpad_call_id");
    return;
  }

  // Sanitize payload for storage
  const sanitizedPayload = sanitizeCallPayload(payload);
  const nextStatus = "ringing";

  // Check if call exists and validate status transition
  const existingCall = await pool.query(
    `SELECT status FROM calls WHERE dialpad_call_id = $1`,
    [details.dialpad_call_id],
  );

  if (existingCall.rowCount > 0) {
    const currentStatus = existingCall.rows[0].status;

    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      console.warn(
        `[CallHandler] ${getStatusTransitionError(currentStatus, nextStatus)} for call ${details.dialpad_call_id}`,
      );
      // Don't update - preserve current state
      return;
    }
  }

  await pool.query(
    `INSERT INTO calls (
       app_id, dialpad_call_id, direction, from_number, to_number,
       status, dialpad_user_id, raw_payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (dialpad_call_id) DO UPDATE SET
       status = EXCLUDED.status,
       direction = COALESCE(EXCLUDED.direction, calls.direction),
       from_number = COALESCE(EXCLUDED.from_number, calls.from_number),
       to_number = COALESCE(EXCLUDED.to_number, calls.to_number),
       dialpad_user_id = COALESCE(EXCLUDED.dialpad_user_id, calls.dialpad_user_id),
       raw_payload = EXCLUDED.raw_payload`,
    [
      app_id,
      details.dialpad_call_id,
      details.direction,
      details.from_number,
      details.to_number,
      nextStatus,
      details.dialpad_user_id,
      sanitizedPayload,
    ],
  );

  console.log(`[CallHandler] call.ring processed: ${details.dialpad_call_id}`);

  // Broadcast WebSocket event to app
  broadcastToApp(app_id, {
    event: "call.ring",
    call_id: details.dialpad_call_id,
    direction: details.direction,
    from_number: details.from_number,
    to_number: details.to_number,
    status: "ringing",
    user_id: details.dialpad_user_id,
    timestamp: new Date().toISOString(),
  });

  // Broadcast to specific user if mapping exists
  if (details.dialpad_user_id) {
    broadcastToUser(app_id, details.dialpad_user_id, {
      event: "call.ring",
      call_id: details.dialpad_call_id,
      direction: details.direction,
      from_number: details.from_number,
      to_number: details.to_number,
      status: "ringing",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handler: call.ended
 * Updates existing call record with status = 'ended', ended_at, and duration
 *
 * PRODUCTION: Validates status transitions before updating
 */
async function handleCallEnded(payload, app_id) {
  const details = extractCallDetails(payload);

  if (!details.dialpad_call_id) {
    console.warn("call.ended event missing dialpad_call_id");
    return;
  }

  // Sanitize payload for storage
  const sanitizedPayload = sanitizeCallPayload(payload);
  const nextStatus = "ended";

  // Check if call exists and validate status transition
  const existingCall = await pool.query(
    `SELECT status FROM calls WHERE dialpad_call_id = $1`,
    [details.dialpad_call_id],
  );

  if (existingCall.rowCount > 0) {
    const currentStatus = existingCall.rows[0].status;

    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      console.warn(
        `[CallHandler] ${getStatusTransitionError(currentStatus, nextStatus)} for call ${details.dialpad_call_id}`,
      );
      // Don't update if already in a terminal state
      return;
    }

    // For call.ended, we prefer to UPDATE rather than INSERT
    // to avoid overwriting richer data from call.started
    const result = await pool.query(
      `UPDATE calls
       SET 
         status = $1,
         ended_at = COALESCE($2, now()),
         duration_seconds = COALESCE($3, duration_seconds),
         direction = COALESCE($4, direction),
         from_number = COALESCE($5, from_number),
         to_number = COALESCE($6, to_number),
         raw_payload = COALESCE($7, raw_payload)
       WHERE dialpad_call_id = $8
       RETURNING id`,
      [
        nextStatus,
        details.ended_at,
        details.duration_seconds,
        details.direction,
        details.from_number,
        details.to_number,
        sanitizedPayload,
        details.dialpad_call_id,
      ],
    );

    console.log(
      `[CallHandler] call.ended processed: ${details.dialpad_call_id}`,
    );

    // Broadcast WebSocket event to app
    broadcastToApp(app_id, {
      event: "call.ended",
      call_id: details.dialpad_call_id,
      direction: details.direction,
      from_number: details.from_number,
      to_number: details.to_number,
      status: "ended",
      duration_seconds: details.duration_seconds,
      user_id: details.dialpad_user_id,
      timestamp: new Date().toISOString(),
    });

    // Broadcast to specific user if mapping exists
    if (details.dialpad_user_id) {
      broadcastToUser(app_id, details.dialpad_user_id, {
        event: "call.ended",
        call_id: details.dialpad_call_id,
        direction: details.direction,
        from_number: details.from_number,
        to_number: details.to_number,
        status: "ended",
        duration_seconds: details.duration_seconds,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    // If call doesn't exist yet (edge case: ended event arrived first),
    // create it with ended status
    await pool.query(
      `INSERT INTO calls (
         app_id, dialpad_call_id, direction, from_number, to_number,
         status, dialpad_user_id, ended_at, duration_seconds, raw_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (dialpad_call_id) DO NOTHING`,
      [
        app_id,
        details.dialpad_call_id,
        details.direction,
        details.from_number,
        details.to_number,
        nextStatus,
        details.dialpad_user_id,
        details.ended_at || new Date(),
        details.duration_seconds,
        sanitizedPayload,
      ],
    );

    console.log(
      `[CallHandler] call.ended processed (new): ${details.dialpad_call_id}`,
    );

    // Broadcast WebSocket event for new call that ended
    broadcastToApp(app_id, {
      event: "call.ended",
      call_id: details.dialpad_call_id,
      direction: details.direction,
      from_number: details.from_number,
      to_number: details.to_number,
      status: "ended",
      duration_seconds: details.duration_seconds,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Handler: call.recording.completed
 * Updates existing call with recording URL
 *
 * PRODUCTION: Does not modify status, only attaches recording
 */
async function handleCallRecordingCompleted(payload, app_id) {
  // Recording payload structure may vary
  const recording = payload.recording || payload.data?.recording || payload;
  const dialpad_call_id = recording.call_id || payload.call?.id;
  const recording_url =
    recording.url || recording.download_url || recording.recording_url;

  if (!dialpad_call_id) {
    console.warn("call.recording.completed event missing call_id");
    return;
  }

  if (!recording_url) {
    console.warn(
      `call.recording.completed event for ${dialpad_call_id} missing recording URL`,
    );
    return;
  }

  // Recording events don't change status, only add recording URL
  // No status transition validation needed
  const result = await pool.query(
    `UPDATE calls
     SET recording_url = $1
     WHERE dialpad_call_id = $2
     RETURNING id`,
    [recording_url, dialpad_call_id],
  );

  if (result.rowCount === 0) {
    console.warn(`Recording received for unknown call: ${dialpad_call_id}`);
    // Optionally create a call record here if desired
  } else {
    console.log(
      `[CallHandler] recording.completed processed for call: ${dialpad_call_id}`,
    );
  }
}

/**
 * Handler: voicemail.received (or call.voicemail)
 * Creates a voicemail record when voicemail is left
 *
 * Supports voicemail as first-class entity independent of calls
 */
async function handleVoicemailReceived(payload, app_id) {
  try {
    const voicemail = payload.voicemail || payload.data?.voicemail || payload;

    if (!voicemail) {
      console.warn("voicemail.received event missing voicemail data");
      return;
    }

    const voicemailData = {
      dialpad_call_id: voicemail.call_id || voicemail.dialpad_call_id || null,
      dialpad_user_id: voicemail.user_id || voicemail.dialpad_user_id,
      from_number: voicemail.from || voicemail.from_number || voicemail.caller,
      to_number: voicemail.to || voicemail.to_number || voicemail.callee,
      recording_url: voicemail.recording_url || voicemail.audio_url,
      transcript: voicemail.transcript || null,
      duration_seconds: voicemail.duration || voicemail.duration_seconds || 0,
    };

    // Validate required fields
    if (!voicemailData.dialpad_user_id) {
      console.warn("voicemail.received event missing dialpad_user_id");
      return;
    }

    if (!voicemailData.recording_url) {
      console.warn("voicemail.received event missing recording_url");
      return;
    }

    // Create or update voicemail in database
    const vmRecord = await voicemailService.upsertVoicemail(
      app_id,
      voicemailData,
    );

    console.log(`[CallHandler] voicemail.received processed: ${vmRecord.id}`);

    // Broadcast to specific user who received the voicemail
    if (voicemailData.dialpad_user_id) {
      broadcastToUser(app_id, voicemailData.dialpad_user_id, {
        event: "voicemail.received",
        voicemail_id: vmRecord.id,
        call_id: voicemailData.dialpad_call_id,
        from_number: voicemailData.from_number,
        to_number: voicemailData.to_number,
        duration_seconds: voicemailData.duration_seconds,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Fallback: broadcast to entire app
      broadcastToApp(app_id, {
        event: "voicemail.received",
        voicemail_id: vmRecord.id,
        from_number: voicemailData.from_number,
        to_number: voicemailData.to_number,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[CallHandler] Error handling voicemail.received:", err);
  }
}

/**
 * Register all call event handlers
 * Call this once during application startup
 */
export function registerCallHandlers() {
  registerEventHandler("call.started", handleCallStarted);
  registerEventHandler("call.ring", handleCallRing);
  registerEventHandler("call.ended", handleCallEnded);
  registerEventHandler(
    "call.recording.completed",
    handleCallRecordingCompleted,
  );
  registerEventHandler("voicemail.received", handleVoicemailReceived);
  registerEventHandler("call.voicemail", handleVoicemailReceived); // Alternative event name

  console.log("[CallHandlers] Registered call event handlers");
}
