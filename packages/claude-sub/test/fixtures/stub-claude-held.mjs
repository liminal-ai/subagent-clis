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
    type: "system",
    subtype: "init",
    session_id: "claude-held",
    uuid: "uuid-init",
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
    type: "result",
    subtype: "success",
    is_error: false,
    result: "released",
    session_id: "claude-held",
    uuid: "uuid-result",
  }) + "\n",
);
process.exit(0);
