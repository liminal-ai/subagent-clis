#!/usr/bin/env node
import { access } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const sentinel = process.env.STUB_RELEASE_FILE;
if (!sentinel) {
  process.stderr.write("STUB_RELEASE_FILE required\n");
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    type: "thread.started",
    thread_id: "codex-held",
  }) + "\n",
);

while (true) {
  try {
    await access(sentinel);
    break;
  } catch {
    await sleep(50);
  }
}

process.stdout.write(
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "released" },
  }) + "\n",
);
process.stdout.write(
  JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
  }) + "\n",
);
process.exit(0);
