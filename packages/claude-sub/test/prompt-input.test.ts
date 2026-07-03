import { describe, it, expect } from "vitest";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, withTempSessions, waitForEnvelope } from "./helpers.js";

const failStub = join(import.meta.dirname, "fixtures", "stub-claude-fail.mjs");
const mustNotRunStub = join(
  import.meta.dirname,
  "fixtures",
  "stub-claude-must-not-run.mjs",
);

describe("prompt input", () => {
  it("exec reads prompt from piped stdin when positional is '-'", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "-"],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        "piped stdin prompt",
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("ok");

      const sessionDir = join(sessionsRoot, envelope.run_id);
      const meta = JSON.parse(
        await readFile(join(sessionDir, "meta.json"), "utf8"),
      );
      expect(meta.prompt).toBe("piped stdin prompt");
      expect(meta.argv.at(-1)).toBe("piped stdin prompt");
    });
  });

  it("start with large stdin prompt survives to meta.json and backend argv", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const largePrompt = "x".repeat(64 * 1024);
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "-"],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        largePrompt,
      );

      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());
      await waitForEnvelope(sessionsRoot, started.run_id);

      const sessionDir = join(sessionsRoot, started.run_id);
      const meta = JSON.parse(
        await readFile(join(sessionDir, "meta.json"), "utf8"),
      );
      expect(meta.prompt).toBe(largePrompt);
      expect(meta.prompt.length).toBeGreaterThanOrEqual(64 * 1024);
      expect(meta.argv.at(-1)).toBe(largePrompt);
    });
  });

  it("exec reads prompt from --prompt-file", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const promptDir = await mkdtemp(join(tmpdir(), "claude-sub-prompt-"));
      const promptPath = join(promptDir, "task.txt");
      await writeFile(promptPath, "file prompt content", "utf8");

      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "--prompt-file", promptPath],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("ok");

      const meta = JSON.parse(
        await readFile(join(sessionsRoot, envelope.run_id, "meta.json"), "utf8"),
      );
      expect(meta.prompt).toBe("file prompt content");
      expect(meta.argv.at(-1)).toBe("file prompt content");
    });
  });

  it("allows passthrough flags after '-' positional", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "-", "--permission-mode", "plan"],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        "stdin with flags",
      );

      expect(code).toBe(0);
    });
  });

  it("errors on empty stdin with '-'", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "-"],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        "   \n  ",
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toContain("empty or whitespace-only");
    });
  });

  it("errors on missing --prompt-file", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "--prompt-file", "/no/such/prompt.txt"],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toContain("cannot read prompt file");
      expect(err.path).toBe("/no/such/prompt.txt");
    });
  });

  it("errors when both positional prompt and --prompt-file are provided", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const promptDir = await mkdtemp(join(tmpdir(), "claude-sub-prompt-"));
      const promptPath = join(promptDir, "task.txt");
      await writeFile(promptPath, "from file", "utf8");

      const { stdout, code } = await runCli(
        [
          "--dir",
          sessionsRoot,
          "exec",
          "inline prompt",
          "--prompt-file",
          promptPath,
        ],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toContain("ambiguous prompt");
      expect(err.error).toContain(
        "Use exactly one of: inline text, - (stdin), or --prompt-file",
      );
    });
  });

  it("errors when '-' and --prompt-file are both provided", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const promptDir = await mkdtemp(join(tmpdir(), "claude-sub-prompt-"));
      const promptPath = join(promptDir, "task.txt");
      await writeFile(promptPath, "from file", "utf8");

      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "-", "--prompt-file", promptPath],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        "stdin text",
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toContain("ambiguous prompt");
      expect(err.error).toContain(
        "Use exactly one of: inline text, - (stdin), or --prompt-file",
      );
    });
  });

  it("errors when both inline prompt and '-' stdin marker are provided", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "inline task", "-"],
        { CLAUDE_SUB_HOME: sessionsRoot },
        undefined,
        "piped stdin content",
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toBe(
        "ambiguous prompt: provide either a positional prompt or - (stdin), not both. Use exactly one of: inline text, - (stdin), or --prompt-file <path>",
      );
    });
  });

  it("rejects a flag-like positional prompt before launching a run", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "--model", "haiku", "--text"],
        {
          CLAUDE_SUB_HOME: sessionsRoot,
          CLAUDE_BIN: mustNotRunStub,
        },
      );

      expect(code).toBe(1);
      const err = JSON.parse(stdout.trim());
      expect(err.error).toBe(
        "prompt looks like a flag: '--model'. Pass inline text, - for stdin, or --prompt-file <path>",
      );
      expect(stderr).not.toContain("STUB_MUST_NOT_RUN");
    });
  });
});
