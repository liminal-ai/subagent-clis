#!/usr/bin/env node
/**
 * Stub claude that emits events slowly for streaming tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

const events = [
  {
    type: "system",
    subtype: "init",
    session_id: "claude-session-slow",
    cwd: "/tmp/test",
    uuid: "uuid-init",
  },
  {
    type: "assistant",
    message: {
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text", text: "First chunk" }],
    },
    session_id: "claude-session-slow",
    uuid: "uuid-assistant1",
  },
  {
    type: "assistant",
    message: {
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text", text: "Final result from slow stub." }],
    },
    session_id: "claude-session-slow",
    uuid: "uuid-assistant2",
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Final result from slow stub.",
    usage: { input_tokens: 10, output_tokens: 5 },
    total_cost_usd: 0.001,
    duration_ms: 1000,
    session_id: "claude-session-slow",
    uuid: "uuid-result",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
  await sleep(250);
}

process.exit(0);
