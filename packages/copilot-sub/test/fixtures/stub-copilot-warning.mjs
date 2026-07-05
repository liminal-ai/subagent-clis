#!/usr/bin/env node
/**
 * Stub Copilot that emits a plain-text warning before JSONL events.
 */
process.stdout.write("WARNING: deprecated API usage\n");

const events = [
  {
    type: "assistant.message",
    data: {
      messageId: "warning-final",
      model: "gpt-5.5",
      content: "Done after warning.",
      toolRequests: [],
    },
  },
  {
    type: "result",
    sessionId: "copilot-session-warning",
    exitCode: 0,
    usage: {
      premiumRequests: 0,
      totalApiDurationMs: 1,
      sessionDurationMs: 1,
      codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] },
    },
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
