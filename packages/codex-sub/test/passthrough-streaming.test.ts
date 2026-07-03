import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, withTempSessions, waitForEnvelope } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const slowStub = join(__dirname, "fixtures", "stub-codex-slow.mjs");

describe("passthrough", () => {
  it("passes bare -s read-only on exec", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "sandbox test", "-s", "read-only"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const entries = await readdir(sessionsRoot);
      const runId = entries[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      expect(meta.argv).toContain("-s");
      expect(meta.argv).toContain("read-only");
      expect(meta.argv).toContain("--json");
    });
  });

  it("still supports explicit -- separator", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const { code } = await runCli(
        ["--dir", sessionsRoot, "exec", "sandbox test", "--", "-s", "read-only"],
        { CODEX_SUB_HOME: sessionsRoot },
      );
      expect(code).toBe(0);

      const entries = await readdir(sessionsRoot);
      const runId = entries[0]!;
      const meta = JSON.parse(
        await readFile(join(sessionsRoot, runId, "meta.json"), "utf8"),
      );

      expect(meta.argv).toContain("-s");
      expect(meta.argv).toContain("read-only");
    });
  });
});

describe("streaming", () => {
  it("appends stream.jsonl incrementally before process exit", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "slow stream test"],
        { CODEX_SUB_HOME: sessionsRoot, CODEX_BIN: slowStub },
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
        { CODEX_SUB_HOME: sessionsRoot },
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
