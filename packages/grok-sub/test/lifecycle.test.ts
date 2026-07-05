import { describe, it, expect } from "vitest";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { runCli, withTempSessions, waitForEnvelope, waitForRunning } from "./helpers.js";

const sleepStub = join(import.meta.dirname, "fixtures", "stub-grok-sleep.mjs");
const heldStub = join(import.meta.dirname, "fixtures", "stub-grok-held.mjs");

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
        { GROK_SUB_HOME: sessionsRoot },
      );

      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());
      expect(started.run_id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
      expect(started.dir).toBe(join(sessionsRoot, started.run_id));

      await waitForEnvelope(sessionsRoot, started.run_id);

      const statusMid = await runCli(
        ["--dir", sessionsRoot, "status", started.run_id],
        { GROK_SUB_HOME: sessionsRoot },
      );
      const statusObj = JSON.parse(statusMid.stdout.trim());
      expect(statusObj.run_id).toBe(started.run_id);
      expect(statusObj.running).toBe(false);
      expect(statusObj.has_envelope).toBe(true);
      expect(statusObj.events).toBeGreaterThan(0);

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id],
        { GROK_SUB_HOME: sessionsRoot },
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
        GROK_SUB_HOME: sessionsRoot,
        GROK_BIN: heldStub,
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
        { GROK_SUB_HOME: sessionsRoot },
      );
      const started = JSON.parse(start.stdout.trim());

      const result = await runCli(
        ["--dir", sessionsRoot, "result", started.run_id, "--wait"],
        { GROK_SUB_HOME: sessionsRoot },
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
        GROK_SUB_HOME: sessionsRoot,
        GROK_BIN: badBin,
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
        { GROK_SUB_HOME: sessionsRoot },
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
        GROK_SUB_HOME: sessionsRoot,
        GROK_BIN: sleepStub,
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

  it("start with bare passthrough --tools writes meta.json and envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "tools test", "--tools", "read_file,grep"],
        { GROK_SUB_HOME: sessionsRoot },
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      await waitForEnvelope(sessionsRoot, started.run_id);

      const sessionDir = join(sessionsRoot, started.run_id);
      const meta = JSON.parse(
        await readFile(join(sessionDir, "meta.json"), "utf8"),
      );
      expect(meta.argv).toContain("--tools");
      expect(meta.argv).toContain("read_file,grep");
      expect(meta.argv).toContain("streaming-json");

      const envelope = JSON.parse(
        await readFile(join(sessionDir, "envelope.json"), "utf8"),
      );
      expect(envelope.status).toBe("ok");
      expect(envelope.result).toBe("Done! Here is the result.");
    });
  });

  it("passes --resume through to grok argv", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        [
          "--dir",
          sessionsRoot,
          "exec",
          "continue please",
          "--resume",
          "grok-session-xyz",
        ],
        { GROK_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const dirs = await readdir(sessionsRoot);
      const runId = dirs[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      const resumeIdx = meta.argv.indexOf("--resume");
      const sessionIdx = meta.argv.indexOf("grok-session-xyz");
      const promptIdx = meta.argv.indexOf("continue please");

      expect(meta.argv[0]).toBe("grok");
      expect(resumeIdx).toBeGreaterThan(-1);
      expect(sessionIdx).toBe(resumeIdx + 1);
      expect(meta.argv[promptIdx - 1]).toBe("-p");
      expect(promptIdx).toBeLessThan(resumeIdx);
    });
  });
});

describe("last/messages/tools", () => {
  it("prints last and messages", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "go"],
        { GROK_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const last = await runCli(
        ["--dir", sessionsRoot, "last", envelope.run_id],
        { GROK_SUB_HOME: sessionsRoot },
      );
      expect(last.stdout.trim()).toBe("Done! Here is the result.");

      const messages = await runCli(
        ["--dir", sessionsRoot, "messages", envelope.run_id],
        { GROK_SUB_HOME: sessionsRoot },
      );
      expect(messages.stdout.trim()).toBe(
        "Done! \n---\nHere is the result.",
      );
    });
  });

  it("prints empty tools JSONL because documented grok streaming-json has no tool events", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "tools"],
        { GROK_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const tools = await runCli(
        ["--dir", sessionsRoot, "tools", envelope.run_id],
        { GROK_SUB_HOME: sessionsRoot },
      );
      const lines = tools.stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBe(0);
    });
  });
});
