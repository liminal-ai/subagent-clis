import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli, withTempSessions } from "./helpers.js";

const failStub = join(import.meta.dirname, "fixtures", "stub-codex-fail.mjs");

describe("exec", () => {
  it("writes a correct envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test prompt", "-m", "gpt-5.5"],
        { CODEX_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.schema_version).toBe(1);
      expect(envelope.backend).toBe("codex");
      expect(envelope.status).toBe("ok");
      expect(envelope.exit_code).toBe(0);
      expect(envelope.session_id).toBe("codex-thread-abc123");
      expect(envelope.model).toBe("gpt-5.5");
      expect(envelope.result).toBe("Done! Here is the result.");
      expect(envelope.usage).toEqual({
        input_tokens: 100,
        cached_input_tokens: 20,
        output_tokens: 50,
      });
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

  it("leaves envelope.model null when -m is not passed", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test prompt"],
        { CODEX_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.model).toBeNull();
    });
  });

  it("supports --text", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "hello", "--text"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);
      expect(stdout.trim()).toBe("Done! Here is the result.");
    });
  });

  it("prints envelope and stderr error on failed run with exit 2", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "fail please", "--text"],
        {
          CODEX_SUB_HOME: sessionsRoot,
          CODEX_BIN: failStub,
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
      const missingBin = join(sessionsRoot, "missing-codex");
      const { stdout, stderr, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "spawn failure"],
        {
          CODEX_SUB_HOME: sessionsRoot,
          CODEX_BIN: missingBin,
        },
      );

      expect(code).toBe(2);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.status).toBe("error");
      expect(envelope.exit_code).not.toBe(0);
      expect(envelope.error).toContain("ENOENT");
      expect(stderr).toContain("ENOENT");
      expect(stderr).not.toContain("    at ");

      const onDisk = JSON.parse(
        await readFile(join(sessionsRoot, envelope.run_id, "envelope.json"), "utf8"),
      );
      expect(onDisk).toEqual(envelope);
    });
  });
});
