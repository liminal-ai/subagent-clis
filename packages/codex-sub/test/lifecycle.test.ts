import { describe, it, expect } from "vitest";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { runCli, withTempSessions, waitForEnvelope, waitForRunning } from "./helpers.js";

const sleepStub = join(import.meta.dirname, "fixtures", "stub-codex-sleep.mjs");
const heldStub = join(import.meta.dirname, "fixtures", "stub-codex-held.mjs");

async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""]);
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("failed to spawn short-lived process");
  }
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", () => resolve());
  });
  return pid;
}

describe("start/status/result lifecycle", () => {
  it("runs detached and completes", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "async prompt"],
        { CODEX_SUB_HOME: sessionsRoot },
      );

      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());
      expect(started.run_id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
      expect(started.dir).toBe(join(sessionsRoot, started.run_id));

      await waitForEnvelope(sessionsRoot, started.run_id);

      const statusMid = await runCli(
        ["--dir", sessionsRoot, "status", started.run_id],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      const statusObj = JSON.parse(statusMid.stdout.trim());
      expect(statusObj.run_id).toBe(started.run_id);
      expect(statusObj.running).toBe(false);
      expect(statusObj.has_envelope).toBe(true);
      expect(statusObj.events).toBeGreaterThan(0);

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout.trim());
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("Done! Here is the result.");
    });
  });

  it("result exits 3 while running", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const sentinel = join(sessionsRoot, "release-held");
      const env = {
        CODEX_SUB_HOME: sessionsRoot,
        CODEX_BIN: heldStub,
        STUB_RELEASE_FILE: sentinel,
      };
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "held"],
        env,
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      try {
        await waitForRunning(sessionsRoot, started.run_id, env);

        const result = await runCli(
          ["--dir", sessionsRoot, "result", started.run_id],
          env,
        );
        expect(result.code).toBe(3);
        expect(JSON.parse(result.stdout.trim())).toEqual({ running: true });
      } finally {
        await writeFile(sentinel, "go");
        await waitForEnvelope(sessionsRoot, started.run_id);
      }
    });
  });

  it("result --wait blocks until done", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "wait test"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      const started = JSON.parse(start.stdout.trim());

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id, "--wait"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout.trim());
      expect(envelope.status).toBe("ok");
    });
  });

  it("start writes an error envelope when backend spawn fails", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const badBin = join(sessionsRoot, "bad-backend");
      await writeFile(badBin, "not-a-valid-executable\n", { mode: 0o755 });
      const env = {
        CODEX_SUB_HOME: sessionsRoot,
        CODEX_BIN: badBin,
      };
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "spawn failure"],
        env,
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      await waitForEnvelope(sessionsRoot, started.run_id);

      const envelope = JSON.parse(
        await readFile(join(sessionsRoot, started.run_id, "envelope.json"), "utf8"),
      );
      expect(envelope.status).toBe("error");
      expect(envelope.exit_code).not.toBe(0);
      expect(envelope.error).toBeTruthy();
    });
  });

  it("result --wait exits 2 when the runner died without an envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const runId = "dead-runner";
      const sessionDir = join(sessionsRoot, runId);
      await mkdir(sessionDir, { recursive: true });
      await writeFile(join(sessionDir, "meta.json"), "{}\n");
      await writeFile(join(sessionDir, "pid"), String(await exitedPid()));

      const result = await runCli(
        ["--dir", sessionsRoot, "result", runId, "--wait"],
        { CODEX_SUB_HOME: sessionsRoot },
        undefined,
        undefined,
        3_000,
      );

      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr.trim())).toEqual({
        error: "envelope not found",
      });
    });
  });

  it("result --wait --timeout exits 4 while the runner is still running", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const env = {
        CODEX_SUB_HOME: sessionsRoot,
        CODEX_BIN: sleepStub,
      };
      const start = await runCli(["--dir", sessionsRoot, "start", "sleep"], env);
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());
      await waitForRunning(sessionsRoot, started.run_id, env);

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id, "--wait", "--timeout", "1"],
        env,
      );

      expect(result.code).toBe(4);
      expect(JSON.parse(result.stdout.trim())).toEqual({
        error: "timeout",
        running: true,
      });

      await runCli(["--dir", sessionsRoot, "stop", started.run_id], env);
    });
  });

  it("start with bare passthrough -s read-only writes meta.json and envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "sandbox test", "-s", "read-only"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      await waitForEnvelope(sessionsRoot, started.run_id);

      const sessionDir = join(sessionsRoot, started.run_id);
      const meta = JSON.parse(
        await readFile(join(sessionDir, "meta.json"), "utf8"),
      );
      expect(meta.argv).toContain("-s");
      expect(meta.argv).toContain("read-only");
      expect(meta.argv).toContain("--json");

      const envelope = JSON.parse(
        await readFile(join(sessionDir, "envelope.json"), "utf8"),
      );
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("Done! Here is the result.");
    });
  });

  it("maps --resume to codex exec resume argv order", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        [
          "--dir",
          sessionsRoot,
          "exec",
          "continue please",
          "--resume",
          "thread-xyz",
        ],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const dirs = await readdir(sessionsRoot);
      const runId = dirs[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      const resumeIdx = meta.argv.indexOf("resume");
      const jsonIdx = meta.argv.indexOf("--json");
      const sessionIdx = meta.argv.indexOf("thread-xyz");
      const promptIdx = meta.argv.indexOf("continue please");

      expect(meta.argv[0]).toBe("codex");
      expect(meta.argv[1]).toBe("exec");
      expect(resumeIdx).toBeGreaterThan(-1);
      expect(jsonIdx).toBeGreaterThan(resumeIdx);
      expect(sessionIdx).toBeGreaterThan(jsonIdx);
      expect(promptIdx).toBeGreaterThan(sessionIdx);
      expect(meta.argv).not.toContain("--resume");
    });
  });
});

describe("last/messages/tools", () => {
  it("prints last and messages", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "go"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const last = await runCli(
        ["--dir", sessionsRoot, "last", envelope.run_id],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(last.stdout.trim()).toBe("Done! Here is the result.");

      const messages = await runCli(
        ["--dir", sessionsRoot, "messages", envelope.run_id],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(messages.stdout.trim()).toBe(
        "Working on it...\n---\nDone! Here is the result.",
      );
    });
  });

  it("prints tools JSONL", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "tools"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const tools = await runCli(
        ["--dir", sessionsRoot, "tools", envelope.run_id],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      const lines = tools.stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBe(2);
      const call = JSON.parse(lines[0]!);
      const result = JSON.parse(lines[1]!);
      expect(call.t).toBe("tool_call");
      expect(call.name).toBe("shell");
      expect(result.t).toBe("tool_result");
      expect(result.ok).toBe(true);
    });
  });
});
