import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runCli,
  withTempSessions,
  waitForRunning,
} from "./helpers.js";

const sleepStub = join(
  import.meta.dirname,
  "fixtures",
  "stub-cursor-agent-sleep.mjs",
);

describe("cli ux", () => {
  it("passes --version through to cursor-agent on exec", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test prompt", "--version"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.backend).toBe("cursor");
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, envelope.run_id, "meta.json"), "utf8"),
      );
      expect(meta.argv).toContain("--version");
    });
  });

  it("honors --dir after subcommand prompt", async () => {
    const sessionsRoot = await mkdtemp(join(tmpdir(), "cursor-sub-dir-"));
    try {
      const { stdout, code } = await runCli(
        ["exec", "test prompt", "--dir", sessionsRoot],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.stream_path).toContain(sessionsRoot);
    } finally {
      await rm(sessionsRoot, { recursive: true, force: true });
    }
  });

  it("passes bare '-' in passthrough after --", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "inline prompt", "--", "-"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(0);
      const entries = await readdir(sessionsRoot);
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, entries[0]!, "meta.json"), "utf8"),
      );
      expect(meta.argv).toContain("-");
    });
  });

  it("passes backend stdin marker '-' for exec - -- -", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "-", "--", "-"],
        { CURSOR_SUB_HOME: sessionsRoot },
        undefined,
        "piped stdin prompt",
      );

      expect(code).toBe(0);
      const entries = await readdir(sessionsRoot);
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, entries[0]!, "meta.json"), "utf8"),
      );
      expect(meta.argv.filter((arg: string) => arg === "-").length).toBe(1);
    });
  });

  it("does not treat --dir after -- as wrapper session root", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const backendDir = await mkdtemp(join(tmpdir(), "cursor-sub-backend-dir-"));
      try {
        const { stdout, code } = await runCli(
          [
            "--dir",
            sessionsRoot,
            "exec",
            "test prompt",
            "--",
            "--dir",
            backendDir,
          ],
          { CURSOR_SUB_HOME: sessionsRoot },
        );

        expect(code).toBe(0);
        const envelope = JSON.parse(stdout.trim());
        expect(envelope.stream_path).toContain(sessionsRoot);
        expect(envelope.stream_path).not.toContain(backendDir);

        const meta = JSON.parse(
          await readFile(join(sessionsRoot, envelope.run_id, "meta.json"), "utf8"),
        );
        expect(meta.argv).toContain("--dir");
        expect(meta.argv).toContain(backendDir);
      } finally {
        await rm(backendDir, { recursive: true, force: true });
      }
    });
  });

  it("errors when --dir has no path", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { stdout, code } = await runCli(
        ["--dir", sessionsRoot, "exec", "test prompt", "--dir"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(code).toBe(1);
      expect(JSON.parse(stdout.trim()).error).toBe("--dir requires a path");
    });
  });

  it("result --timeout implies --wait and exits 4 on timeout", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const env = {
        CURSOR_SUB_HOME: sessionsRoot,
        CURSOR_AGENT_BIN: sleepStub,
      };
      const start = await runCli(["--dir", sessionsRoot, "start", "sleep"], env);
      const started = JSON.parse(start.stdout.trim());
      await waitForRunning(sessionsRoot, started.run_id, env);

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id, "--timeout", "1"],
        env,
      );

      expect(result.code).toBe(4);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        error: "timeout",
        running: true,
      });

      await runCli(["--dir", sessionsRoot, "stop", started.run_id], env);
    });
  });

  it("list -n 0 prints empty output", async () => {
    await withTempSessions(async (sessionsRoot) => {
      await runCli(["--dir", sessionsRoot, "exec", "one"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });

      const list = await runCli(["--dir", sessionsRoot, "list", "-n", "0"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });

      expect(list.code).toBe(0);
      expect(list.stdout.trim()).toBe("");
    });
  });

  it("list -n garbage is a usage error", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const list = await runCli(["--dir", sessionsRoot, "list", "-n", "garbage"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });

      expect(list.code).toBe(1);
      expect(JSON.parse(list.stdout.trim()).error).toContain(
        "non-negative integer",
      );
    });
  });
});
