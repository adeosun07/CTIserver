/**
 * Manual Event Processing Script
 *
 * Use this script to manually process webhook events or check processing statistics.
 *
 * Usage:
 *   node scripts/processEvents.js          # Process all unprocessed events once
 *   node scripts/processEvents.js stats    # Show processing statistics
 */

import "dotenv/config";
import {
  processWebhookEvents,
  getProcessingStats,
} from "../services/dialpadEventProcessor.js";
import { registerCallHandlers } from "../services/callEventHandlers.js";

const command = process.argv[2] || "process";

async function main() {
  // Register handlers first
  registerCallHandlers();

  if (command === "stats") {
    // Show statistics
    console.log("Fetching webhook processing statistics...\n");
    const stats = await getProcessingStats();

    console.log("Processing Statistics:");
    console.log("─".repeat(50));
    console.log(`Unprocessed events:  ${stats.unprocessed}`);
    console.log(`Processed events:    ${stats.processed}`);
    console.log(`Event types:         ${stats.event_types}`);
    console.log(`Oldest unprocessed:  ${stats.oldest_unprocessed || "N/A"}`);
    console.log("─".repeat(50));
  } else if (command === "process") {
    // Process events
    console.log("Processing webhook events...\n");

    const startTime = Date.now();
    const stats = await processWebhookEvents({
      batchSize: 50,
    });
    const duration = Date.now() - startTime;

    console.log("Processing Complete:");
    console.log("─".repeat(50));
    console.log(`Processed:  ${stats.processed} events`);
    console.log(`Failed:     ${stats.failed} events`);
    console.log(`Duration:   ${duration}ms`);
    console.log(`Success:    ${stats.success ? "✓" : "✗"}`);
    console.log("─".repeat(50));
  } else {
    console.log("Unknown command. Use: process, stats");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
