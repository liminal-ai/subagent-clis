import { describe, it, expect } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { runCli, withTempSessions, waitForEnvelope, waitForRunning } from "./helpers.js";

const sleepStub = join(import.meta.dirname, "fixtures", "stub-cursor-agent-sleep.mjs");

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
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());
      expect(started.run_id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
      expect(started.dir).toBe(join(sessionsRoot, started.run_id));

      await waitForEnvelope(sessionsRoot, started.run_id);

      const statusMid = await runCli(
        ["--dir", sessionsRoot, "status", started.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const statusObj = JSON.parse(statusMid.stdout.trim());
      expect(statusObj.run_id).toBe(started.run_id);
      expect(statusObj.running).toBe(false);
      expect(statusObj.has_envelope).toBe(true);
      expect(statusObj.events).toBeGreaterThan(0);

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout.trim());
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("Done! Here is the result.");
    });
  });

  it("result exits 3 while running", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "slow"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );

      expect([0, 1, 3]).toContain(result.code);
      if (result.code === 3) {
        expect(JSON.parse(result.stdout.trim())).toEqual({ running: true });
      }
    });
  });

  it("result --wait blocks until done", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "wait test"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const started = JSON.parse(start.stdout.trim());

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id, "--wait"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.stdout.trim());
      expect(envelope.status).toBe("ok");
    });
  });

  it("start writes an error envelope when backend spawn fails", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const missingBin = join(sessionsRoot, "missing-cursor-agent");
      const env = {
        CURSOR_SUB_HOME: sessionsRoot,
        CURSOR_AGENT_BIN: missingBin,
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
      expect(envelope.error).toContain("ENOENT");
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
        { CURSOR_SUB_HOME: sessionsRoot },
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
        CURSOR_SUB_HOME: sessionsRoot,
        CURSOR_AGENT_BIN: sleepStub,
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

  it("start with bare passthrough --mode plan writes meta.json and envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "plan this", "--mode", "plan"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      await waitForEnvelope(sessionsRoot, started.run_id);

      const sessionDir = join(sessionsRoot, started.run_id);
      const meta = JSON.parse(
        await readFile(join(sessionDir, "meta.json"), "utf8"),
      );
      expect(meta.argv).toContain("--mode");
      expect(meta.argv).toContain("plan");
      expect(meta.argv).not.toContain("--force");
      expect(meta.argv).not.toContain("--sandbox");

      const envelope = JSON.parse(
        await readFile(join(sessionDir, "envelope.json"), "utf8"),
      );
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("Done! Here is the result.");
    });
  });
});

describe("last/messages/tools", () => {
  it("prints last and messages", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "go"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const last = await runCli(
        ["--dir", sessionsRoot, "last", envelope.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(last.stdout.trim()).toBe("Done! Here is the result.");

      const messages = await runCli(
        ["--dir", sessionsRoot, "messages", envelope.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
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
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const tools = await runCli(
        ["--dir", sessionsRoot, "tools", envelope.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const lines = tools.stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBe(2);
      const call = JSON.parse(lines[0]!);
      const result = JSON.parse(lines[1]!);
      expect(call.t).toBe("tool_call");
      expect(call.name).toBe("Read");
      expect(result.t).toBe("tool_result");
      expect(result.ok).toBe(true);
    });
  });
});
