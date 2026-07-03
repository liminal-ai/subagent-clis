import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import { runCli, withTempSessions, waitForEnvelope, waitForRunning } from "./helpers.js";

const sleepStub = join(
  import.meta.dirname,
  "fixtures",
  "stub-cursor-agent-sleep.mjs",
);

describe("list", () => {
  it("lists recent runs as JSONL with session_id", async () => {
    await withTempSessions(async (sessionsRoot) => {
      await runCli(["--dir", sessionsRoot, "exec", "first"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });
      await runCli(["--dir", sessionsRoot, "exec", "second run prompt"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });

      const list = await runCli(["--dir", sessionsRoot, "list", "-n", "5"], {
        CURSOR_SUB_HOME: sessionsRoot,
      });
      expect(list.code).toBe(0);
      const lines = list.stdout.trim().split("\n").filter(Boolean);
      expect(lines.length).toBe(2);

      const runs = lines.map((l) => JSON.parse(l));
      expect(runs[0]!.prompt).toBe("second run prompt");
      expect(runs[0]!.status).toBe("ok");
      expect(runs[0]!.model).toBe("composer-2.5");
      expect(runs[0]!.session_id).toBe("cursor-session-abc123");
      expect(runs[0]!.run_id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
    });
  });

  it("scopes list and latest resolution to cwd by default", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const cwdA = await mkdtemp(join(tmpdir(), "cursor-sub-cwd-a-"));
      const cwdB = await mkdtemp(join(tmpdir(), "cursor-sub-cwd-b-"));
      const cwdC = await mkdtemp(join(tmpdir(), "cursor-sub-cwd-c-"));
      try {
        await runCli(
          ["--dir", sessionsRoot, "exec", "run A"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdA,
        );
        await runCli(
          ["--dir", sessionsRoot, "exec", "run B"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdB,
        );

        const listB = await runCli(
          ["--dir", sessionsRoot, "list"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdB,
        );
        const runsB = listB.stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
        expect(runsB.length).toBe(1);
        expect(runsB[0]!.prompt).toBe("run B");

        const statusB = await runCli(
          ["--dir", sessionsRoot, "status"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdB,
        );
        expect(statusB.code).toBe(0);
        expect(JSON.parse(statusB.stdout.trim()).run_id).toBe(runsB[0]!.run_id);

        const statusC = await runCli(
          ["--dir", sessionsRoot, "status"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdC,
        );
        expect(statusC.code).toBe(1);
        expect(JSON.parse(statusC.stdout.trim()).error).toBe(
          "no runs for this directory; use --all for all directories",
        );

        const listAll = await runCli(
          ["--dir", sessionsRoot, "list", "--all"],
          { CURSOR_SUB_HOME: sessionsRoot },
          cwdC,
        );
        expect(listAll.stdout.trim().split("\n").filter(Boolean).length).toBe(2);
      } finally {
        await rm(cwdA, { recursive: true, force: true });
        await rm(cwdB, { recursive: true, force: true });
        await rm(cwdC, { recursive: true, force: true });
      }
    });
  });
});

describe("stop", () => {
  it("stops a running detached run and writes error envelope", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const start = await runCli(
        ["--dir", sessionsRoot, "start", "sleep forever"],
        { CURSOR_SUB_HOME: sessionsRoot, CURSOR_AGENT_BIN: sleepStub },
      );
      expect(start.code).toBe(0);
      const started = JSON.parse(start.stdout.trim());

      await waitForRunning(sessionsRoot, started.run_id, {
        CURSOR_SUB_HOME: sessionsRoot,
      });

      const stop = await runCli(
        ["--dir", sessionsRoot, "stop", started.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(stop.code).toBe(0);
      expect(JSON.parse(stop.stdout.trim())).toEqual({
        run_id: started.run_id,
        stopped: true,
      });

      await waitForEnvelope(sessionsRoot, started.run_id);
      const envelope = JSON.parse(
        await readFile(join(sessionsRoot, started.run_id, "envelope.json"), "utf8"),
      );
      expect(envelope.status).toBe("error");
      expect(envelope.error).toBe("run was stopped");
    });
  });

  it("errors when stopping an already-finished run", async () => {
    await withTempSessions(async (sessionsRoot) => {
      const exec = await runCli(
        ["--dir", sessionsRoot, "exec", "done"],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      const envelope = JSON.parse(exec.stdout.trim());

      const stop = await runCli(
        ["--dir", sessionsRoot, "stop", envelope.run_id],
        { CURSOR_SUB_HOME: sessionsRoot },
      );
      expect(stop.code).toBe(1);
      expect(JSON.parse(stop.stdout.trim()).error).toContain("already finished");
    });
  });
});
