#!/usr/bin/env node
/**
 * Stub cursor-agent that emits events slowly for streaming tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

const events = [
  {
    type: "system",
    subtype: "init",
    model: "composer-2.5",
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "First chunk" }],
    },
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "Final result from slow stub." }],
    },
  },
  {
    type: "result",
    session_id: "cursor-session-slow",
    usage: { input_tokens: 10, output_tokens: 5 },
    is_error: false,
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
  await sleep(250);
}

process.exit(0);
