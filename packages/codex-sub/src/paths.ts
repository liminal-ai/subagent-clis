import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const SCHEMA_VERSION = 1;
export const BACKEND = "codex" as const;

export function getSessionsRoot(override?: string): string {
  const root =
    override ??
    process.env.CODEX_SUB_HOME ??
    join(homedir(), ".subagent-clis", "codex", "sessions");
  return root;
}

export function getSessionDir(sessionsRoot: string, runId: string): string {
  return join(sessionsRoot, runId);
}

export function sessionFilePaths(sessionDir: string) {
  return {
    meta: join(sessionDir, "meta.json"),
    raw: join(sessionDir, "raw.jsonl"),
    stream: join(sessionDir, "stream.jsonl"),
    stderr: join(sessionDir, "stderr.log"),
    pid: join(sessionDir, "pid"),
    envelope: join(sessionDir, "envelope.json"),
  };
}

export function generateRunId(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const hex = randomBytes(3).toString("hex");
  return `${y}${m}${d}-${h}${min}${s}-${hex}`;
}
