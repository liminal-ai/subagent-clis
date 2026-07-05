#!/usr/bin/env node
/**
 * Stub grok that emits events slowly for streaming tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

const events = [
  { type: "thought", data: "Starting slow response." },
  { type: "text", data: "First chunk" },
  { type: "text", data: " and final result from slow stub." },
  {
    type: "end",
    stopReason: "EndTurn",
    sessionId: "grok-session-slow",
    requestId: "req-slow",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
  await sleep(250);
}

process.exit(0);
