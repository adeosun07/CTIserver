/**
 * Test Data Generator
 *
 * Creates sample webhook events in the database for testing event processing.
 *
 * Usage:
 *   node scripts/generateTestEvents.js
 */

import "dotenv/config";
import pool from "../db.js";

async function generateTestEvents() {
  console.log("Generating test webhook events...\n");

  // First, get or create a test app
  let appId;
  const appResult = await pool.query(
    `INSERT INTO apps (name, api_key, is_active)
     VALUES ('Test App', 'test_key_' || gen_random_uuid()::text, true)
     ON CONFLICT (api_key) DO NOTHING
     RETURNING id`,
  );

  if (appResult.rowCount > 0) {
    appId = appResult.rows[0].id;
  } else {
    const existingApp = await pool.query(`SELECT id FROM apps LIMIT 1`);
    appId = existingApp.rows[0].id;
  }

  console.log(`Using app_id: ${appId}\n`);

  // Generate test events
  const testEvents = [
    {
      event_type: "call.ring",
      dialpad_event_id: `test_ring_${Date.now()}`,
      payload: {
        call: {
          id: 999888777,
          direction: "inbound",
          from: "+15551234567",
          to: "+15559876543",
          user_id: 12345,
        },
      },
    },
    {
      event_type: "call.started",
      dialpad_event_id: `test_started_${Date.now()}`,
      payload: {
        call: {
          id: 999888777,
          direction: "inbound",
          from: "+15551234567",
          to: "+15559876543",
          user_id: 12345,
          started_at: new Date().toISOString(),
        },
      },
    },
    {
      event_type: "call.ended",
      dialpad_event_id: `test_ended_${Date.now()}`,
      payload: {
        call: {
          id: 999888777,
          direction: "inbound",
          from: "+15551234567",
          to: "+15559876543",
          user_id: 12345,
          started_at: new Date(Date.now() - 120000).toISOString(),
          ended_at: new Date().toISOString(),
          duration: 120,
        },
      },
    },
    {
      event_type: "call.recording.completed",
      dialpad_event_id: `test_recording_${Date.now()}`,
      payload: {
        recording: {
          call_id: 999888777,
          url: "https://example.com/recordings/test123.mp3",
        },
      },
    },
  ];

  for (const event of testEvents) {
    try {
      await pool.query(
        `INSERT INTO webhook_events (app_id, event_type, dialpad_event_id, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (dialpad_event_id) DO NOTHING`,
        [appId, event.event_type, event.dialpad_event_id, event.payload],
      );
      console.log(`✓ Created ${event.event_type} event`);
    } catch (err) {
      console.error(`✗ Failed to create ${event.event_type}:`, err.message);
    }
  }

  console.log("\nTest events created successfully!");
  console.log("\nNext steps:");
  console.log("1. Run: node scripts/processEvents.js stats");
  console.log("2. Run: node scripts/processEvents.js process");
  console.log(
    "3. Check the calls table for the test call (dialpad_call_id: 999888777)",
  );

  process.exit(0);
}

generateTestEvents().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
