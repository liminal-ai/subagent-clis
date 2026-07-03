#!/usr/bin/env node
/**
 * Stub codex that emits events slowly for streaming tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

const events = [
  {
    type: "thread.started",
    thread_id: "codex-thread-slow",
  },
  {
    type: "turn.started",
  },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "First chunk" },
  },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "Final result from slow stub." },
  },
  {
    type: "turn.completed",
    usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 },
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
  await sleep(250);
}

process.exit(0);
