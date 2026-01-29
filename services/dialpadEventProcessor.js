import pool from "../db.js";

/**
 * Webhook Event Processor Service
 *
 * Processes webhook events from the webhook_events table by:
 * 1. Fetching unprocessed events
 * 2. Routing them to type-specific handlers
 * 3. Marking them as processed
 *
 * Design principles:
 * - Idempotent processing (safe to re-run)
 * - Easy to extend with new event types
 * - Separated concerns from webhook ingestion
 */

/**
 * Event handler registry
 * Maps event_type strings to handler functions
 */
const eventHandlers = {};

/**
 * Register a handler for a specific event type
 * @param {string} eventType - The event type (e.g., 'call.started')
 * @param {Function} handler - Async function that processes the event
 */
export function registerEventHandler(eventType, handler) {
  eventHandlers[eventType] = handler;
}

/**
 * Process a single webhook event
 * @param {Object} event - Event row from webhook_events table
 * @returns {Promise<boolean>} - True if processed successfully
 */
async function processSingleEvent(event) {
  const { id, event_type, payload, app_id } = event;

  // Find handler for this event type
  const handler = eventHandlers[event_type];

  if (!handler) {
    console.warn(`No handler registered for event type: ${event_type}`);
    // Still mark as processed to avoid reprocessing unknown events
    return true;
  }

  try {
    // Call the handler with payload and app_id
    await handler(payload, app_id);
    return true;
  } catch (err) {
    console.error(`Error processing event ${id} (${event_type}):`, err);
    return false;
  }
}

/**
 * Mark an event as processed in the database
 * @param {string} eventId - UUID of the webhook_event
 */
async function markEventProcessed(eventId) {
  await pool.query(
    `UPDATE webhook_events
     SET processed_at = now()
     WHERE id = $1`,
    [eventId],
  );
}

/**
 * Process all unprocessed webhook events
 * @param {Object} options - Processing options
 * @param {number} options.batchSize - Number of events to process per batch (default: 50)
 * @param {number} options.maxEvents - Maximum total events to process (default: unlimited)
 * @returns {Promise<Object>} - Statistics about processed events
 */
export async function processWebhookEvents(options = {}) {
  const { batchSize = 50, maxEvents = null } = options;

  let totalProcessed = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    // Check if we've hit the max events limit
    if (maxEvents !== null && totalProcessed >= maxEvents) {
      break;
    }

    // Fetch a batch of unprocessed events
    const limit =
      maxEvents !== null
        ? Math.min(batchSize, maxEvents - totalProcessed)
        : batchSize;

    /**
     * CONCURRENCY SAFETY: Use FOR UPDATE SKIP LOCKED
     *
     * - FOR UPDATE: Locks the rows for this transaction
     * - SKIP LOCKED: Skips rows already locked by other workers
     *
     * This ensures that if multiple processor instances are running,
     * each event is only processed by one worker at a time.
     *
     * Critical for production deployments with:
     * - Horizontal scaling (multiple server instances)
     * - Load balancers
     * - Container orchestration (K8s, ECS, etc.)
     */
    const result = await pool.query(
      `SELECT id, app_id, event_type, dialpad_event_id, payload, received_at
       FROM webhook_events
       WHERE processed_at IS NULL
       ORDER BY received_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    const events = result.rows;

    if (events.length === 0) {
      hasMore = false;
      break;
    }

    // Process each event in the batch
    for (const event of events) {
      const success = await processSingleEvent(event);

      if (success) {
        await markEventProcessed(event.id);
        totalProcessed++;
      } else {
        totalFailed++;
        // Note: Failed events are NOT marked as processed
        // They will be retried on the next run
      }
    }

    // If we got fewer events than requested, we've processed everything
    if (events.length < limit) {
      hasMore = false;
    }
  }

  return {
    processed: totalProcessed,
    failed: totalFailed,
    success: totalProcessed > 0 && totalFailed === 0,
  };
}

/**
 * Process webhook events continuously with a polling interval
 * @param {Object} options - Polling options
 * @param {number} options.intervalMs - Polling interval in milliseconds (default: 5000)
 * @param {number} options.batchSize - Events per batch (default: 50)
 * @returns {Function} - Stop function to halt polling
 */
export function startEventProcessor(options = {}) {
  const { intervalMs = 5000, batchSize = 50 } = options;

  let isRunning = true;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const stats = await processWebhookEvents({ batchSize });
      if (stats.processed > 0 || stats.failed > 0) {
        console.log(
          `[EventProcessor] Processed: ${stats.processed}, Failed: ${stats.failed}`,
        );
      }
    } catch (err) {
      console.error("[EventProcessor] Error during polling:", err);
    }

    if (isRunning) {
      setTimeout(poll, intervalMs);
    }
  };

  // Start polling
  poll();

  // Return stop function
  return () => {
    isRunning = false;
    console.log("[EventProcessor] Stopped");
  };
}

/**
 * Get processing statistics
 * @returns {Promise<Object>} - Statistics about webhook event processing
 */
export async function getProcessingStats() {
  const result = await pool.query(
    `SELECT 
       COUNT(*) FILTER (WHERE processed_at IS NULL) as unprocessed,
       COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
       COUNT(DISTINCT event_type) as event_types,
       MIN(received_at) FILTER (WHERE processed_at IS NULL) as oldest_unprocessed
     FROM webhook_events`,
  );

  return result.rows[0];
}
