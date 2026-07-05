#!/usr/bin/env node
/**
 * Stub codex that emits a plain-text warning before JSON events.
 */
process.stdout.write("WARNING: rate limit approaching\n");

const events = [
  {
    type: "thread.started",
    thread_id: "codex-thread-warning",
  },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "Done after warning." },
  },
  {
    type: "turn.completed",
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
