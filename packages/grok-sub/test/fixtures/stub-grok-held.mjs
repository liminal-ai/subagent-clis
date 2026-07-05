#!/usr/bin/env node
import { access } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const sentinel = process.env.STUB_RELEASE_FILE;
if (!sentinel) {
  process.stderr.write("STUB_RELEASE_FILE required\n");
  process.exit(1);
}

process.stdout.write(JSON.stringify({ type: "thought", data: "holding" }) + "\n");

while (true) {
  try {
    await access(sentinel);
    break;
  } catch {
    await sleep(50);
  }
}

process.stdout.write(JSON.stringify({ type: "text", data: "released" }) + "\n");
process.stdout.write(
  JSON.stringify({
    type: "end",
    stopReason: "EndTurn",
    sessionId: "grok-held",
    requestId: "req-held",
  }) + "\n",
);
process.exit(0);
