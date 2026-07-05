import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { runCli, withTempSessions } from "./helpers.js";
import {
  buildGrokExecArgs,
  extractModelFromArgs,
  validateResumePassthrough,
} from "../src/args.js";

const mustNotRunStub = join(
  import.meta.dirname,
  "fixtures",
  "stub-grok-must-not-run.mjs",
);

describe("resume passthrough", () => {
  it("errors when --resume has no session id", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume"],
        { GROK_SUB_HOME: sessionsRoot, GROK_BIN: mustNotRunStub },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
      expect(stderr).not.toContain("STUB_MUST_NOT_RUN");
    });
  });

  it("errors when --resume is followed by another flag", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume", "--foo"],
        { GROK_SUB_HOME: sessionsRoot, GROK_BIN: mustNotRunStub },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
      expect(stderr).not.toContain("STUB_MUST_NOT_RUN");
    });
  });

  it("errors when --resume= has no value", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "continue please", "--resume="],
        { GROK_SUB_HOME: sessionsRoot, GROK_BIN: mustNotRunStub },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe(
        "--resume requires a session id",
      );
      expect(stderr).not.toContain("STUB_MUST_NOT_RUN");
    });
  });

  it("validates short -r the same way", () => {
    expect(validateResumePassthrough(["-r"])).toBe(
      "--resume requires a session id",
    );
    expect(validateResumePassthrough(["-r", "--foo"])).toBe(
      "--resume requires a session id",
    );
    expect(validateResumePassthrough(["-r", "sess-ok"])).toBeNull();
  });
});

describe("grok argv helpers", () => {
  it("uses -p=<prompt> for flag-like prompt values", () => {
    expect(buildGrokExecArgs("--model", [])).toContain("-p=--model");
  });

  it("extractModelFromArgs skips prompt and value-taking flag values", () => {
    expect(
      extractModelFromArgs([
        "-p",
        "--model",
        "--output-format",
        "streaming-json",
        "--always-approve",
      ]),
    ).toBeNull();

    expect(
      extractModelFromArgs([
        "-p=--model",
        "--output-format",
        "streaming-json",
      ]),
    ).toBeNull();

    expect(
      extractModelFromArgs([
        "-p",
        "normal prompt",
        "--output-format",
        "--model",
        "--always-approve",
      ]),
    ).toBeNull();

    expect(
      extractModelFromArgs([
        "-p",
        "normal prompt",
        "--output-format",
        "streaming-json",
        "--model",
        "grok-build",
      ]),
    ).toBe("grok-build");
  });
});
