#!/usr/bin/env node
import { access } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const sentinel = process.env.STUB_RELEASE_FILE;
if (!sentinel) {
  process.stderr.write("STUB_RELEASE_FILE required\n");
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  type: "session.tools_updated",
  data: { model: "gpt-5.5" },
}) + "\n");
process.stdout.write(JSON.stringify({
  type: "assistant.turn_start",
  data: { turnId: "0" },
}) + "\n");

while (true) {
  try {
    await access(sentinel);
    break;
  } catch {
    await sleep(50);
  }
}

process.stdout.write(JSON.stringify({
  type: "assistant.message",
  data: {
    messageId: "held-final",
    model: "gpt-5.5",
    content: "released",
    toolRequests: [],
  },
}) + "\n");
process.stdout.write(JSON.stringify({
  type: "result",
  sessionId: "copilot-held",
  exitCode: 0,
  usage: {
    premiumRequests: 0,
    totalApiDurationMs: 1,
    sessionDurationMs: 1,
    codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] },
  },
}) + "\n");
process.exit(0);
