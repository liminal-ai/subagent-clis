import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
  appendFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { sessionFilePaths } from "./paths.js";
import type { Envelope, MetaJson } from "./envelope.js";

export async function ensureSessionDir(sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
}

export async function writeMeta(sessionDir: string, meta: MetaJson): Promise<void> {
  const paths = sessionFilePaths(sessionDir);
  await writeFile(paths.meta, JSON.stringify(meta, null, 2) + "\n");
}

export async function writePid(sessionDir: string, pid: number): Promise<void> {
  const paths = sessionFilePaths(sessionDir);
  await writeFile(paths.pid, String(pid));
}

export async function writeEnvelope(
  sessionDir: string,
  envelope: Envelope,
): Promise<void> {
  const paths = sessionFilePaths(sessionDir);
  await writeFile(paths.envelope, JSON.stringify(envelope, null, 2) + "\n");
}

export async function readEnvelope(sessionDir: string): Promise<Envelope | null> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.envelope)) {
    return null;
  }
  const text = await readFile(paths.envelope, "utf8");
  return JSON.parse(text) as Envelope;
}

export async function readMeta(sessionDir: string): Promise<MetaJson | null> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.meta)) {
    return null;
  }
  const text = await readFile(paths.meta, "utf8");
  return JSON.parse(text) as MetaJson;
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function getPid(sessionDir: string): Promise<number | null> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.pid)) {
    return null;
  }
  const text = await readFile(paths.pid, "utf8");
  const pid = Number.parseInt(text.trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

export async function isSessionRunning(sessionDir: string): Promise<boolean> {
  const envelope = await readEnvelope(sessionDir);
  if (envelope) {
    return false;
  }
  const pid = await getPid(sessionDir);
  if (pid === null) {
    return false;
  }
  return isProcessRunning(pid);
}

export async function countStreamEvents(sessionDir: string): Promise<number> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.stream)) {
    return 0;
  }
  const text = await readFile(paths.stream, "utf8");
  if (!text) {
    return 0;
  }
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}

export async function getLastEventTs(sessionDir: string): Promise<string | null> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.stream)) {
    return null;
  }
  const text = await readFile(paths.stream, "utf8");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }
  try {
    const last = JSON.parse(lines[lines.length - 1]!) as { ts?: string };
    return last.ts ?? null;
  } catch {
    return null;
  }
}

export interface RunScopeOptions {
  cwd?: string;
  all?: boolean;
}

export type ResolveRunResult =
  | { ok: true; dir: string }
  | { ok: false; error: string };

async function listRunDirs(
  sessionsRoot: string,
): Promise<Array<{ dir: string; run_id: string; mtime: number }>> {
  if (!existsSync(sessionsRoot)) {
    return [];
  }

  const entries = await readdir(sessionsRoot);
  const runs: Array<{ dir: string; run_id: string; mtime: number }> = [];

  for (const entry of entries) {
    const dir = join(sessionsRoot, entry);
    try {
      const s = await stat(dir);
      if (s.isDirectory()) {
        runs.push({ dir, run_id: entry, mtime: s.mtimeMs });
      }
    } catch {
      // ignore
    }
  }

  return runs;
}

async function getRunCwd(sessionDir: string): Promise<string | null> {
  const meta = await readMeta(sessionDir);
  if (meta?.cwd) {
    return meta.cwd;
  }
  const envelope = await readEnvelope(sessionDir);
  return envelope?.cwd ?? null;
}

export async function resolveRun(
  sessionsRoot: string,
  runId: string | undefined,
  options: RunScopeOptions = {},
): Promise<ResolveRunResult> {
  if (runId) {
    const dir = join(sessionsRoot, runId);
    if (!existsSync(dir)) {
      return { ok: false, error: `run not found: ${runId}` };
    }
    return { ok: true, dir };
  }

  const allRuns = await listRunDirs(sessionsRoot);
  if (allRuns.length === 0) {
    return { ok: false, error: "no runs found" };
  }

  const cwd = options.cwd ?? process.cwd();
  let candidates = allRuns;

  if (!options.all) {
    const filtered: typeof allRuns = [];
    for (const run of allRuns) {
      const runCwd = await getRunCwd(run.dir);
      if (runCwd === cwd) {
        filtered.push(run);
      }
    }
    if (filtered.length === 0) {
      return {
        ok: false,
        error: "no runs for this directory; use --all for all directories",
      };
    }
    candidates = filtered;
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  return { ok: true, dir: candidates[0]!.dir };
}

export async function resolveRunDir(
  sessionsRoot: string,
  runId?: string,
  options: RunScopeOptions = {},
): Promise<string | null> {
  const result = await resolveRun(sessionsRoot, runId, options);
  return result.ok ? result.dir : null;
}

export async function listRuns(
  sessionsRoot: string,
  limit: number,
  options: RunScopeOptions = {},
): Promise<
  Array<{
    run_id: string;
    session_id: string | null;
    status: string | null;
    model: string | null;
    started_at: string | null;
    cwd: string | null;
    prompt: string;
  }>
> {
  let runs = await listRunDirs(sessionsRoot);

  if (!options.all) {
    const cwd = options.cwd ?? process.cwd();
    const filtered: typeof runs = [];
    for (const run of runs) {
      const runCwd = await getRunCwd(run.dir);
      if (runCwd === cwd) {
        filtered.push(run);
      }
    }
    runs = filtered;
  }

  runs.sort((a, b) => b.mtime - a.mtime);
  const selected = runs.slice(0, limit);
  const results = [];

  for (const run of selected) {
    const dir = join(sessionsRoot, run.run_id);
    const envelope = await readEnvelope(dir);
    const meta = await readMeta(dir);
    const prompt = meta?.prompt ?? "";
    results.push({
      run_id: run.run_id,
      session_id: envelope?.session_id ?? null,
      status: envelope?.status ?? (await isSessionRunning(dir) ? "running" : null),
      model: envelope?.model ?? meta?.model ?? null,
      started_at: envelope?.started_at ?? meta?.started_at ?? null,
      cwd: envelope?.cwd ?? meta?.cwd ?? null,
      prompt: prompt.length > 80 ? prompt.slice(0, 80) : prompt,
    });
  }

  return results;
}

export async function stopSession(
  sessionDir: string,
  runId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!existsSync(sessionDir)) {
    return { ok: false, error: `run not found: ${runId}` };
  }

  const envelope = await readEnvelope(sessionDir);
  if (envelope) {
    return { ok: false, error: `run already finished: ${runId}` };
  }

  const running = await isSessionRunning(sessionDir);
  if (!running) {
    return { ok: false, error: `run not running: ${runId}` };
  }

  const pid = await getPid(sessionDir);
  if (pid === null) {
    return { ok: false, error: `run not running: ${runId}` };
  }

  process.kill(pid, "SIGTERM");
  return { ok: true };
}

export async function appendRawLine(sessionDir: string, line: string): Promise<void> {
  const paths = sessionFilePaths(sessionDir);
  await appendFile(paths.raw, line + "\n");
}

export async function appendStreamLine(
  sessionDir: string,
  event: Record<string, unknown>,
): Promise<void> {
  const paths = sessionFilePaths(sessionDir);
  await appendFile(paths.stream, JSON.stringify(event) + "\n");
}

export async function readAssistantMessages(sessionDir: string): Promise<string[]> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.stream)) {
    return [];
  }
  const text = await readFile(paths.stream, "utf8");
  const messages: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line) as { t?: string; text?: string };
      if (evt.t === "message" && typeof evt.text === "string") {
        messages.push(evt.text);
      }
    } catch {
      // ignore
    }
  }
  return messages;
}

export async function readToolEvents(
  sessionDir: string,
): Promise<Array<Record<string, unknown>>> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.stream)) {
    return [];
  }
  const text = await readFile(paths.stream, "utf8");
  const events: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line) as { t?: string };
      if (evt.t === "tool_call" || evt.t === "tool_result") {
        events.push(evt as Record<string, unknown>);
      }
    } catch {
      // ignore
    }
  }
  return events;
}

export async function tailStderr(sessionDir: string, maxBytes = 2048): Promise<string> {
  const paths = sessionFilePaths(sessionDir);
  if (!existsSync(paths.stderr)) {
    return "";
  }
  const buf = await readFile(paths.stderr);
  if (buf.length <= maxBytes) {
    return buf.toString("utf8");
  }
  return buf.subarray(buf.length - maxBytes).toString("utf8");
}
