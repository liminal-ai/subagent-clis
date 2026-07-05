#!/usr/bin/env node
/**
 * Stub cursor-agent that exits 0 but reports is_error:true on the result event.
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
      content: [{ type: "text", text: "Something went wrong internally." }],
    },
  },
  {
    type: "result",
    session_id: "cursor-session-err",
    usage: { input_tokens: 10, output_tokens: 5 },
    is_error: true,
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
