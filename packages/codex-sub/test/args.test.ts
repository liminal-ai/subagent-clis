import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  validateResumePassthrough,
  extractResumeSessionId,
} from "../src/args.js";
import { runCli, withTempSessions } from "./helpers.js";

const mustNotRunStub = join(
  import.meta.dirname,
  "fixtures",
  "stub-codex-must-not-run.mjs",
);

describe("resume passthrough", () => {
  it("errors when --resume has no session id", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume"],
        {
          CODEX_SUB_HOME: sessionsRoot,
          CODEX_BIN: mustNotRunStub,
        },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
    });
  });

  it("errors when --resume is followed by another flag", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume", "--foo"],
        {
          CODEX_SUB_HOME: sessionsRoot,
          CODEX_BIN: mustNotRunStub,
        },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
    });
  });

  it("errors when --resume= has no value", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume="],
        {
          CODEX_SUB_HOME: sessionsRoot,
          CODEX_BIN: mustNotRunStub,
        },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
    });
  });

  it("accepts --resume=<session-id>", () => {
    const parsed = extractResumeSessionId(["--resume=thread-eq", "-s", "read-only"]);
    expect(parsed.resumeSessionId).toBe("thread-eq");
    expect(parsed.passthrough).toEqual(["-s", "read-only"]);
    expect(validateResumePassthrough(["--resume=thread-eq"])).toBeNull();
  });
});
