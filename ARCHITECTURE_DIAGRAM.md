# Production Hardened Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WEBHOOK INGESTION                            │
│                     (Existing - Unchanged)                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
                    Dialpad Webhook Arrives
                    (Full Payload Preserved)
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      webhook_events TABLE                           │
│  - id, app_id, event_type, dialpad_event_id                        │
│  - payload (JSONB) ← Full payload stored here                      │
│  - received_at, processed_at                                        │
│                                                                      │
│  CONSTRAINT: UNIQUE(dialpad_event_id) ← Prevents duplicates        │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
          ┌─────────────────────────────────────────┐
          │    EVENT PROCESSOR (Polling)            │
          │  services/dialpadEventProcessor.js      │
          │                                          │
          │  SELECT ... FOR UPDATE SKIP LOCKED ←    │
          │  ✓ Row-level locking                    │
          │  ✓ Safe for multiple instances          │
          │  ✓ No duplicate processing              │
          └─────────────────────────────────────────┘
                                  │
                                  ↓
                        Event Router
                    (by event_type)
                                  │
          ┌───────────────────────┼───────────────────────┐
          ↓                       ↓                       ↓
    call.ring              call.started            call.ended
          │                       │                       │
          └───────────────────────┴───────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    CALL EVENT HANDLER                               │
│              services/callEventHandlers.js                          │
│                                                                      │
│  1. Extract call details                                            │
│     extractCallDetails(payload)                                     │
│                                                                      │
│  2. ✓ Normalize Direction                                           │
│     normalizeCallDirection()                                        │
│     'incoming' → 'inbound'                                          │
│     'outgoing' → 'outbound'                                         │
│                                                                      │
│  3. ✓ Sanitize Payload                                              │
│     sanitizeCallPayload()                                           │
│     - Truncate transcripts (500 chars)                             │
│     - Remove binary data                                            │
│     - Limit arrays (10 items)                                       │
│     - 90% size reduction                                            │
│                                                                      │
│  4. ✓ Validate Status Transition                                    │
│     isValidStatusTransition(current, next)                          │
│     - Query existing call status                                    │
│     - Check transition matrix                                       │
│     - Protect terminal states                                       │
│     - Log warning if invalid                                        │
│                                                                      │
│  5. Execute UPSERT                                                  │
│     INSERT ... ON CONFLICT DO UPDATE                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         calls TABLE                                 │
│  - id, app_id, dialpad_call_id (UNIQUE)                            │
│  - direction ← Normalized ('inbound' | 'outbound')                 │
│  - status ← Validated (no invalid transitions)                      │
│  - from_number, to_number, dialpad_user_id                         │
│  - started_at, ended_at, duration_seconds                           │
│  - recording_url                                                    │
│  - raw_payload (JSONB) ← Sanitized payload (~90% smaller)          │
│  - created_at                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
                      Mark Event Processed
                                  │
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     webhook_events TABLE                            │
│  UPDATE processed_at = now()                                        │
└─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
                     STATUS TRANSITION MATRIX
═══════════════════════════════════════════════════════════════════════

    ┌─────────┐
    │ ringing │
    └────┬────┘
         │
    ┌────┼───────────┬──────────┬──────────┐
    ↓    ↓           ↓          ↓          ↓
┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐
│ active │  │ ended  │  │ missed │  │ rejected │
└───┬────┘  └────────┘  └────────┘  └──────────┘
    │           ↑
    │           │
    └───────────┴──────────┐
                │          ↓
          ┌──────────┐  ┌───────────┐
          │voicemail │  │   ended   │
          └──────────┘  └───────────┘
                        (TERMINAL)

  ✓ ringing → active, ended, missed, rejected, voicemail
  ✓ active → ended, voicemail
  ✗ ended → (any) - TERMINAL STATE PROTECTED
  ✗ missed → (any) - TERMINAL STATE PROTECTED
  ✗ rejected → (any) - TERMINAL STATE PROTECTED
  ✗ voicemail → (any) - TERMINAL STATE PROTECTED


═══════════════════════════════════════════════════════════════════════
                   CONCURRENCY SAFETY MODEL
═══════════════════════════════════════════════════════════════════════

Instance 1:                  Instance 2:                 Instance 3:
┌─────────┐                 ┌─────────┐                ┌─────────┐
│SELECT...│                 │SELECT...│                │SELECT...│
│FOR UPDATE│                │FOR UPDATE│               │FOR UPDATE│
│SKIP LOCKED│               │SKIP LOCKED│              │SKIP LOCKED│
└────┬────┘                 └────┬────┘                └────┬────┘
     │                           │                          │
     ↓                           ↓                          ↓
   Gets:                      Gets:                      Gets:
   Events                     Events                     Events
   1-50                      51-100                    101-150
     │                           │                          │
     ↓                           ↓                          ↓
  Process                     Process                    Process
  Independently              Independently              Independently

  ✓ No overlapping events
  ✓ No race conditions
  ✓ Linear scaling
  ✓ No external coordination needed


═══════════════════════════════════════════════════════════════════════
                    PAYLOAD SANITIZATION
═══════════════════════════════════════════════════════════════════════

BEFORE (webhook_events.payload):           AFTER (calls.raw_payload):
┌──────────────────────────────┐          ┌──────────────────────────┐
│ {                            │          │ {                        │
│   call: {                    │          │   call: {                │
│     id: 123,                 │          │     id: 123,             │
│     direction: "incoming"    │          │     direction: "inbound" │
│   },                         │          │   },                     │
│   transcript: "Lorem ipsum..." │  →    │   transcript: "Lorem..." │
│   (50,000 chars)             │          │   [truncated] (500 ch)   │
│   participants: [            │          │   participants: [        │
│     ... 100 items ...        │          │     ... 10 items,        │
│   ],                         │          │     {_truncated: true}   │
│   audio_data: <binary>       │          │   ],                     │
│   metadata: {                │          │   audio_data: "[removed]"│
│     ... 500 keys ...         │          │   metadata: {            │
│   }                          │          │     sample_keys: [...5]  │
│ }                            │          │     total_keys: 500      │
│                              │          │   }                      │
│ Size: 500 KB                 │          │ }                        │
└──────────────────────────────┘          │ Size: 20 KB (96% smaller)│
                                          └──────────────────────────┘

PRESERVED:                                REMOVED/REDUCED:
✓ Call ID                                 × Binary data
✓ Direction (normalized)                  × Long transcripts (>500ch)
✓ Numbers                                 × Large arrays (>10 items)
✓ User IDs                                × Deep nesting (>5 levels)
✓ Timestamps                              × Large metadata (>20 keys)
✓ Key debugging info

═══════════════════════════════════════════════════════════════════════
```
