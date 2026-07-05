#!/usr/bin/env node
/**
 * Stub Copilot that emits events slowly for streaming tests.
 */
import { setTimeout as sleep } from "node:timers/promises";

const events = [
  {
    type: "session.tools_updated",
    data: { model: "gpt-5.5" },
    ephemeral: true,
  },
  {
    type: "assistant.turn_start",
    data: { turnId: "0" },
  },
  {
    type: "assistant.message_delta",
    data: { messageId: "slow-final", deltaContent: "First chunk" },
    ephemeral: true,
  },
  {
    type: "assistant.message",
    data: {
      messageId: "slow-final",
      model: "gpt-5.5",
      content: "First chunk and final result from slow stub.",
      toolRequests: [],
    },
  },
  {
    type: "result",
    sessionId: "copilot-session-slow",
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
  await sleep(250);
}

process.exit(0);
