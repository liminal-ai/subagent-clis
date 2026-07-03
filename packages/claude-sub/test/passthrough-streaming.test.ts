import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, withTempSessions, waitForEnvelope } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const slowStub = join(__dirname, "fixtures", "stub-claude-slow.mjs");

describe("passthrough", () => {
  it("passes bare --permission-mode plan on exec", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "plan test", "--permission-mode", "plan"],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const entries = await readdir(sessionsRoot);
      const runId = entries[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      expect(meta.argv).toContain("--permission-mode");
      expect(meta.argv).toContain("plan");
      expect(meta.argv).toContain("-p");
      expect(meta.argv).toContain("--output-format");
      expect(meta.argv).toContain("stream-json");
      expect(meta.argv).toContain("--verbose");
      expect(meta.argv).not.toContain("--dangerously-skip-permissions");
    });
  });

  it("appends --dangerously-skip-permissions by default", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "default autonomy"],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const entries = await readdir(sessionsRoot);
      const runId = entries[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      expect(meta.argv).toContain("--dangerously-skip-permissions");
    });
  });

  it("still supports explicit -- separator", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "plan test", "--", "--permission-mode", "plan"],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const entries = await readdir(sessionsRoot);
      const runId = entries[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      expect(meta.argv).toContain("--permission-mode");
      expect(meta.argv).toContain("plan");
    });
  });
});

describe("streaming", () => {
  it("appends stream.jsonl incrementally before process exit", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "slow stream test"],
        { CLAUDE_SUB_HOME: sessionsRoot, CLAUDE_BIN: slowStub },
      );
      expect(start.code).toBe(0);
      const { run_id: runId } = JSON.parse(start.stdout.trim());
      const sessionDir = join(sessionsRoot, runId);

      let sawLiveEvents = false;

      for (let i = 0; i < 40; i++) {
        const hasEnvelope = await readFile(join(sessionDir, "envelope.json"), "utf8")
          .then(() => true)
          .catch(() => false);

        const streamText = await readFile(join(sessionDir, "stream.jsonl"), "utf8").catch(
          () => "",
        );
        const lines = streamText.split("\n").filter((line) => line.trim().length > 0);

        if (lines.length > 0 && !hasEnvelope) {
          sawLiveEvents = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 50));
      }

      expect(sawLiveEvents).toBe(true);

      const status = await runCli(
        ["--dir", sessionsRoot, "status", runId],
        { CLAUDE_SUB_HOME: sessionsRoot },
      );
      const statusObj = JSON.parse(status.stdout.trim());
      expect(statusObj.events).toBeGreaterThan(0);
      expect(statusObj.last_event_ts).toBeTruthy();

      await waitForEnvelope(sessionsRoot, runId);

      const finalStream = await readFile(join(sessionDir, "stream.jsonl"), "utf8");
      const finalLines = finalStream.split("\n").filter((line) => line.trim().length > 0);
      expect(finalLines.length).toBeGreaterThan(1);

      const timestamps = finalLines.map(
        (line) => (JSON.parse(line) as { ts: string }).ts,
      );
      expect(new Set(timestamps).size).toBeGreaterThan(1);
      expect(timestamps[0]).not.toBe(timestamps[timestamps.length - 1]);
    });
  });
});
