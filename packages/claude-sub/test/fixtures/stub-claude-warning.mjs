#!/usr/bin/env node
/**
 * Stub claude that emits a plain-text warning before stream-json events.
 */
process.stdout.write("WARNING: deprecated API usage\n");

const events = [
  {
    type: "system",
    subtype: "init",
    session_id: "claude-session-warning",
    cwd: "/tmp/test",
    model: "claude-sonnet-4-20250514",
    uuid: "uuid-init",
  },
  {
    type: "assistant",
    message: {
      model: "claude-sonnet-4-20250514",
      content: [{ type: "text", text: "Done after warning." }],
    },
    session_id: "claude-session-warning",
    uuid: "uuid-assistant",
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Done after warning.",
    usage: { input_tokens: 1, output_tokens: 1 },
    session_id: "claude-session-warning",
    uuid: "uuid-result",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
