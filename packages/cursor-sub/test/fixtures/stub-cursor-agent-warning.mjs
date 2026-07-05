#!/usr/bin/env node
/**
 * Stub cursor-agent that emits a plain-text warning before stream-json events.
 */
process.stdout.write("WARNING: experimental feature enabled\n");

const events = [
  {
    type: "system",
    subtype: "init",
    model: "composer-2.5",
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "Done after warning." }],
    },
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Done after warning.",
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
