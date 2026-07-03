#!/usr/bin/env node
/**
 * Stub codex for tests. Emits a canned --json event sequence.
 */
const events = [
  {
    type: "thread.started",
    thread_id: "codex-thread-abc123",
  },
  {
    type: "turn.started",
  },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "Working on it..." },
  },
  {
    type: "item.completed",
    item: { type: "reasoning", text: "I should run a command first." },
  },
  {
    type: "item.started",
    item: { type: "command_execution", command: "echo hello" },
  },
  {
    type: "item.completed",
    item: {
      type: "command_execution",
      command: "echo hello",
      exit_code: 0,
      aggregated_output: "hello\n",
    },
  },
  {
    type: "item.completed",
    item: { type: "agent_message", text: "Done! Here is the result." },
  },
  {
    type: "turn.completed",
    usage: {
      input_tokens: 100,
      cached_input_tokens: 20,
      output_tokens: 50,
    },
  },
  {
    type: "weird_unknown_event",
    foo: "bar",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
