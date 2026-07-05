#!/usr/bin/env node
/**
 * Stub grok for tests. Emits a canned streaming-json sequence.
 */
import { writeFile } from "node:fs/promises";

if (process.env.STUB_ARGV_FILE) {
  await writeFile(process.env.STUB_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
}

const events = [
  { type: "thought", data: "I should answer directly." },
  { type: "text", data: "Done! " },
  { type: "text", data: "Here is the result." },
  { type: "max_turns_reached", limit: 3 },
  {
    type: "end",
    stopReason: "EndTurn",
    sessionId: "grok-session-abc123",
    requestId: "req-abc123",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
