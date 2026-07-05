#!/usr/bin/env node
/**
 * Stub cursor-agent that prefixes the first JSON line with ANSI color codes.
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
      content: [{ type: "text", text: "ANSI prefix handled." }],
    },
  },
  {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "ANSI prefix handled.",
  },
];

for (let i = 0; i < events.length; i++) {
  const line = JSON.stringify(events[i]);
  if (i === 0) {
    process.stdout.write(`\x1b[33m${line}\x1b[0m\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

process.exit(0);
