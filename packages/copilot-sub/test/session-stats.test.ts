import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readStreamStats } from "../src/session.js";

describe("readStreamStats", () => {
  it("counts events and returns last ts from a large stream in one pass", async () => {
    const sessionDir = await mkdtemp(join(tmpdir(), "copilot-sub-stream-stats-"));
    try {
      const lines: string[] = [];
      for (let i = 0; i < 400; i++) {
        lines.push(
          JSON.stringify({
            t: "other",
            raw_type: "synthetic",
            data: { i },
            ts: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
          }),
        );
      }
      await writeFile(join(sessionDir, "stream.jsonl"), lines.join("\n") + "\n");

      const stats = await readStreamStats(sessionDir);
      expect(stats.count).toBe(400);
      expect(stats.lastEventTs).toBe("2026-01-01T00:00:39.000Z");
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
