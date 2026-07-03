#!/usr/bin/env node
/**
 * Stub cursor-agent for tests. Emits a canned stream-json sequence.
 */
const events = [
  {
    type: "system",
    subtype: "init",
    model: "composer-2.5",
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "Working on it..." }],
    },
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "thinking", text: "I should read the file first." }],
    },
  },
  {
    type: "tool_call",
    subtype: "started",
    call_id: "call-1",
    tool_call: {
      readToolCall: {
        args: { path: "/tmp/example.txt" },
      },
    },
  },
  {
    type: "tool_call",
    subtype: "completed",
    call_id: "call-1",
    tool_call: {
      readToolCall: {
        result: {
          success: { content: "hello from file" },
        },
      },
    },
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "Done! Here is the result." }],
    },
  },
  {
    type: "result",
    session_id: "cursor-session-abc123",
    usage: { input_tokens: 100, output_tokens: 50 },
    is_error: false,
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
