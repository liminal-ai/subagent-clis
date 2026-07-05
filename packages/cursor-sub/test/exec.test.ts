import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli, withTempSessions } from "./helpers.js";

const failStub = join(import.meta.dirname, "fixtures", "stub-cursor-agent-fail.mjs");
const isErrorStub = join(import.meta.dirname, "fixtures", "stub-cursor-agent-is-error.mjs");
const warningStub = join(import.meta.dirname, "fixtures", "stub-cursor-agent-warning.mjs");
const ansiStub = join(import.meta.dirname, "fixtures", "stub-cursor-agent-ansi.mjs");

describe("exec", () => {
  beforeAll(() => {
    if (!process.env.VITEST) {
      // built dist required
    }
  });

  it("writes a correct envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test prompt"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.schema_version).toBe(1);
      expect(envelope.backend).toBe("cursor");
      expect(envelope.status).toBe("ok");
      expect(envelope.exit_code).toBe(0);
      expect(envelope.session_id).toBe("cursor-session-abc123");
      expect(envelope.model).toBe("composer-2.5");
      expect(envelope.result).toBe("Done! Here is the result.");
      expect(envelope.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
      expect(envelope.stream_path).toContain("stream.jsonl");
      expect(envelope.raw_path).toContain("raw.jsonl");
      expect(envelope.stderr_path).toContain("stderr.log");

      const streamText = await readFile(envelope.stream_path, "utf8");
      const lines = streamText.trim().split("\n");
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const evt = JSON.parse(line);
        expect(evt.ts).toBeTruthy();
      }
    });
  });

  it("supports --text", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "hello", "--text"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("Done! Here is the result.");
    });
  });

  it("reports error status and exit 2 when result is_error is true but backend exits 0", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "fail internally"],
        {
          CURSOR_SUB_HOME: sessionsRoot,
          CURSOR_AGENT_BIN: isErrorStub,
        },
      );

      expect(code).toBe(2);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("error");
      expect(envelope.exit_code).toBe(0);
      expect(envelope.result).toBe("Something went wrong internally.");
    });
  });

  it("prints envelope and stderr error on failed run with exit 2", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "fail please", "--text"],
        {
          CURSOR_SUB_HOME: sessionsRoot,
          CURSOR_AGENT_BIN: failStub,
        },
      );

      expect(code).toBe(2);
      expect(stdout.trim()).not.toBe("");
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("error");
      expect(envelope.error).toContain("simulated backend failure");
      expect(stderr.trim()).toBe("simulated backend failure");
    });
  });

  it("writes an error envelope when backend spawn fails", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const badBin = join(sessionsRoot, "bad-backend");
      await writeFile(badBin, "not-a-valid-executable\n", { mode: 0o755 });
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "spawn failure"],
        {
          CURSOR_SUB_HOME: sessionsRoot,
          CURSOR_AGENT_BIN: badBin,
        },
      );

      expect(code).toBe(2);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("error");
      expect(envelope.exit_code).not.toBe(0);
      expect(envelope.error).toBeTruthy();
      expect(stderr).toBeTruthy();
      expect(stderr).not.toContain("    at ");

      const onDisk = JSON.parse(
        await readFile(join(sessionsRoot, envelope.run_id, "envelope.json"), "utf8"),
      );
      expect(onDisk).toEqual(envelope);
    });
  });

  it("rejects CURSOR_AGENT_BIN pointing at a directory", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const badBin = join(sessionsRoot, "bin-dir");
      await mkdir(badBin);
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test"],
        { CURSOR_SUB_HOME: sessionsRoot, CURSOR_AGENT_BIN: badBin },
      );
      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toContain("not found");
    });
  });

  it("appends non-JSON stdout lines to raw.jsonl verbatim", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "warning test"],
        {
          CURSOR_SUB_HOME: sessionsRoot,
          CURSOR_AGENT_BIN: warningStub,
        },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("ok");

      const rawText = await readFile(envelope.raw_path, "utf8");
      expect(rawText).toContain("WARNING: experimental feature enabled");
    });
  });

  it("maps ANSI-prefixed JSON to canonical events while keeping raw verbatim", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "ansi test"],
        {
          CURSOR_SUB_HOME: sessionsRoot,
          CURSOR_AGENT_BIN: ansiStub,
        },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("ANSI prefix handled.");

      const rawText = await readFile(envelope.raw_path, "utf8");
      expect(rawText).toContain("\x1b[33m");

      const streamText = await readFile(envelope.stream_path, "utf8");
      const lifecycle = streamText
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((evt) => evt.t === "lifecycle" && evt.event === "start");
      expect(lifecycle).toBeTruthy();
    });
  });
});
