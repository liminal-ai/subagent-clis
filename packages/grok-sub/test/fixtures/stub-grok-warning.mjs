#!/usr/bin/env node
/**
 * Stub grok that emits a plain-text warning before streaming-json events.
 */
process.stdout.write("WARNING: deprecated API usage\n");

const events = [
  { type: "text", data: "Done after warning." },
  {
    type: "end",
    stopReason: "EndTurn",
    sessionId: "grok-session-warning",
    requestId: "req-warning",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
