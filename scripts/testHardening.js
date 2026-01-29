/**
 * Test Production Hardening Utilities
 *
 * Run this to verify the hardening utilities work correctly.
 *
 * Usage: node scripts/testHardening.js
 */

import {
  normalizeCallDirection,
  isValidStatusTransition,
  sanitizeCallPayload,
  getStatusTransitionError,
  CALL_STATUSES,
} from "../utils/callHelpers.js";

console.log("=".repeat(60));
console.log("Testing Production Hardening Utilities");
console.log("=".repeat(60));

// Test 1: Direction Normalization
console.log("\n1. DIRECTION NORMALIZATION");
console.log("-".repeat(60));

const directions = [
  "inbound",
  "incoming",
  "in",
  "INBOUND",
  "outbound",
  "outgoing",
  "out",
  "OUTBOUND",
  "unknown",
  null,
  undefined,
];

directions.forEach((dir) => {
  const normalized = normalizeCallDirection(dir);
  console.log(`  "${dir}" → "${normalized}"`);
});

// Test 2: Status Transitions
console.log("\n2. STATUS TRANSITION VALIDATION");
console.log("-".repeat(60));

const transitions = [
  ["ringing", "active"],
  ["ringing", "ended"],
  ["ringing", "missed"],
  ["active", "ended"],
  ["active", "voicemail"],
  ["ended", "active"], // Invalid
  ["ended", "ringing"], // Invalid
  ["missed", "active"], // Invalid
  ["active", "active"], // Same (allowed)
];

transitions.forEach(([current, next]) => {
  const valid = isValidStatusTransition(current, next);
  const status = valid ? "✓" : "✗";
  console.log(`  ${status} ${current} → ${next}`);

  if (!valid) {
    console.log(`     Error: ${getStatusTransitionError(current, next)}`);
  }
});

// Test 3: Payload Sanitization
console.log("\n3. PAYLOAD SANITIZATION");
console.log("-".repeat(60));

const testPayloads = [
  {
    name: "Small payload",
    payload: {
      call: { id: 123, direction: "inbound" },
      user: { name: "John" },
    },
  },
  {
    name: "Large transcript",
    payload: {
      call: { id: 456 },
      transcript: "x".repeat(10000), // 10KB
      voicemail_transcript: "y".repeat(5000), // 5KB
    },
  },
  {
    name: "Binary data",
    payload: {
      call: { id: 789 },
      audio_data: Buffer.from("audio bytes"),
      binary_data: "some binary stuff",
      file_data: "file contents",
    },
  },
  {
    name: "Large array",
    payload: {
      call: { id: 101 },
      participants: Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
      })),
    },
  },
  {
    name: "Deep nesting",
    payload: {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: "deep value",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "Large metadata",
    payload: {
      call: { id: 202 },
      metadata: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`key${i}`, `value${i}`]),
      ),
    },
  },
];

testPayloads.forEach(({ name, payload }) => {
  const originalSize = JSON.stringify(payload).length;
  const sanitized = sanitizeCallPayload(payload);
  const sanitizedSize = JSON.stringify(sanitized).length;
  const reduction = ((1 - sanitizedSize / originalSize) * 100).toFixed(1);

  console.log(`\n  ${name}:`);
  console.log(`    Original:  ${originalSize.toLocaleString()} bytes`);
  console.log(`    Sanitized: ${sanitizedSize.toLocaleString()} bytes`);
  console.log(`    Reduction: ${reduction}%`);

  // Show sample of sanitized payload
  if (name === "Large transcript") {
    console.log(
      `    Transcript length: ${sanitized.transcript?.length || 0} chars`,
    );
  }
  if (name === "Binary data") {
    console.log(`    Audio data: ${sanitized.audio_data}`);
  }
  if (name === "Large array") {
    console.log(
      `    Participants: ${sanitized.participants?.length || 0} items`,
    );
  }
  if (name === "Large metadata") {
    console.log(
      `    Metadata keys: ${JSON.stringify(sanitized.metadata?.sample_keys || [])}`,
    );
  }
});

// Test 4: Call Statuses
console.log("\n4. CALL STATUSES ENUM");
console.log("-".repeat(60));
Object.entries(CALL_STATUSES).forEach(([key, value]) => {
  console.log(`  ${key}: "${value}"`);
});

console.log("\n" + "=".repeat(60));
console.log("All tests completed!");
console.log("=".repeat(60) + "\n");
